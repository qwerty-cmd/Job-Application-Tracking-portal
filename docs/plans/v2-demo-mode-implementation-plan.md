# V2: Public Demo Mode — Implementation Plan

## Overview

All demo logic is client-side only. MSW service worker intercepts every API call in demo mode — no Azure Cosmos DB or Blob Storage traffic is ever made. No backend changes, no new Azure resources.

---

## Phase Dependency Order

```
Phase 1: demoMode.ts utility (sessionStorage + MSW worker lifecycle)
    ↓
Phase 2: main.tsx — restore MSW worker on page refresh
    ↓
Phase 3: AuthContext — add isDemoMode, enterDemo, exitDemo
    ↓
Phase 4: api.ts — skip /.auth/me and use relative BASE_URL in demo mode
    ↓
Phase 5: LoginPage — add "Try Demo" button
Phase 6: NavBar — add demo banner + Exit Demo button
    ↓
Phase 7: handlers.ts — richer seed data + blob PUT handler
    ↓
Phase 8: Tests
```

---

## Phase 1 — New file: `client/src/lib/demoMode.ts`

Central module that owns all sessionStorage interaction and MSW worker lifecycle. Every other module imports from here.

- `const DEMO_MODE_KEY = "demo_mode"` — namespaced key
- `isDemoMode(): boolean` — reads sessionStorage
- `setDemoMode(active: boolean): void` — writes or removes the key
- `startDemoWorker(): Promise<void>` — dynamically imports `../mocks/browser`, calls `worker.start({ onUnhandledRequest: "bypass" })`, stores the reference in module scope. Guards with a `workerStarted` boolean to avoid double-starting.
- `stopDemoWorker(): void` — calls `worker.stop()` and resets the reference and flag

Dynamic import keeps MSW (~50 KB gzipped) out of the main production bundle — Vite code-splits it automatically and it only downloads when the user clicks "Try Demo".

---

## Phase 2 — Modify: `client/src/main.tsx`

`enableMocking()` currently gates MSW on `MODE === "development"`. Extend it:

```
if MODE === "development" AND VITE_DISABLE_MSW !== "true":
    start worker (always-on in dev)
else if isDemoMode() === true:
    start worker (restores worker after F5 refresh in demo mode)
```

The existing `enableMocking().then(render)` pattern already guarantees the worker is active before React renders — no structural change needed.

---

## Phase 3 — Modify: `client/src/contexts/AuthContext.tsx`

Add to `AuthContextValue` interface:
- `isDemoMode: boolean`
- `enterDemo: () => Promise<void>`
- `exitDemo: () => void`

**`enterDemo()`:**
1. Call `await startDemoWorker()` — worker must be active before anything else
2. Call `setDemoMode(true)`
3. Call `invalidatePrincipalCache()`
4. Set demo user in state: `setUser({ identityProvider: "demo", userId: "demo-user", userDetails: "Demo Visitor", userRoles: ["authenticated", "owner"] })`
5. Navigation is handled by the caller (LoginPage) after the promise resolves

**`exitDemo()`:**
1. Call `stopDemoWorker()`
2. Call `setDemoMode(false)`
3. Call `invalidatePrincipalCache()`
4. `window.location.href = "/login"` — full page reload cleanly resets all state

**`isDemoMode`** value: derived from `user?.identityProvider === "demo"`

**`checkAuth` useEffect**: No special casing needed. On refresh, `main.tsx` restores the worker before React renders. When `checkAuth` then hits `/.auth/me`, MSW intercepts it and returns the demo principal (which has the `owner` role) — so `AuthContext` gets `isOwner: true` transparently.

---

## Phase 4 — Modify: `client/src/lib/api.ts`

Two changes needed for demo mode:

**1. Skip `/.auth/me` call:**
```typescript
async function getPrincipalHeader(): Promise<string | null> {
  if (isDemoMode()) return null; // MSW handles auth; no header needed
  // ... existing logic
}
```

**2. Use relative BASE_URL (critical gotcha):**

`VITE_API_URL` in production is an absolute URL (`https://func-xxx.azurewebsites.net`). MSW handlers are registered with relative paths (`/api/applications`). An absolute request URL (`https://func-xxx.azurewebsites.net/api/applications`) will NOT match a relative handler path — MSW won't intercept it.

Fix: make `BASE_URL` a getter instead of a `const`:
```typescript
function getBaseUrl(): string {
  if (isDemoMode()) return ""; // relative paths so MSW intercepts
  return import.meta.env.VITE_API_URL ?? "";
}
```
Use `getBaseUrl()` everywhere `BASE_URL` is currently used.

---

## Phase 5 — Modify: `client/src/pages/LoginPage.tsx`

Add "Try Demo" below the GitHub sign-in button:

```
[Sign in with GitHub]          ← existing, variant="default"

─── or ───

[Try the Demo]                 ← new, variant="outline"
Explore with sample data. No account needed.
```

Implementation:
- Destructure `enterDemo` from `useAuth()`
- Local `isDemoLoading` state for spinner while worker starts
- `onClick`: `setIsDemoLoading(true)` → `await enterDemo()` → `navigate("/")` (or let auth state redirect automatically)
- Also add "Try Demo instead" link on the "Access Denied" branch (authenticated non-owner)

---

## Phase 6 — Modify: `client/src/components/NavBar.tsx`

Destructure `isDemoMode` and `exitDemo` from `useAuth()`.

When `isDemoMode` is true, show inside the header:
```
| Job Tracker | Applications | Dashboard | Trash |   [DEMO MODE badge] [Exit Demo button]  |
```

- Use an amber/warning-colored badge for `DEMO MODE` — visually obvious without alarming
- `Exit Demo` button calls `exitDemo()` which does a full page reload to `/login`
- When `isDemoMode` is false, show the existing `user.userDetails` + Logout button

---

## Phase 7 — Modify: `client/src/mocks/handlers.ts`

### Richer seed data

Replace the single `mockApplication` with 7–8 varied applications. All `dateApplied` values in March 2026 (current month) so they show in the default dashboard date range.

| id | Company | Role | Status | Interviews | Notes |
|----|---------|------|--------|------------|-------|
| app-1 | Contoso Ltd | Senior Cloud Engineer | Interview Stage | 2 (Phone passed, Technical pending) | resume + cover letter |
| app-2 | Fabrikam Corp | Platform Engineer | Accepted | 3 (Phone passed, Technical passed, Panel passed) | resume |
| app-3 | Northwind Inc | DevOps Engineer | Rejected | 1 (Technical failed) | resume + JD file |
| app-4 | Litware Solutions | Site Reliability Engineer | Recruiter Screening | 0 | resume |
| app-5 | Adventure Works | Cloud Architect | Application Submitted | 0 | resume + cover letter + JD text |
| app-6 | Tailspin Toys | Infrastructure Engineer | Withdrawn | 0 | none |
| app-7 | Woodgrove Bank | Azure DevOps Engineer | Applying | 0 | none |

Set `let nextId = 8` to avoid ID collisions.

Each application needs a `history` array with at least `application_created` and relevant lifecycle events.

### Blob PUT handler

Add a handler that intercepts the direct-to-storage PUT and fakes success:
```typescript
http.put("https://storage.blob.core.windows.net/*", () => {
  return new HttpResponse(null, { status: 201 });
})
```

### Simulate processUpload

Modify the `POST /api/upload/sas-token` handler to immediately write file metadata to the in-memory `db` (setting `uploadedAt` to `new Date().toISOString()`). This means the frontend polling logic (`GET /:id` until `uploadedAt` is newer) succeeds on the first poll.

---

## Phase 8 — Tests

### New: `client/src/lib/demoMode.test.ts`
- `isDemoMode()` returns false when sessionStorage is empty
- `isDemoMode()` returns true after `setDemoMode(true)`
- `setDemoMode(false)` removes the key

### Modify: `client/src/pages/LoginPage.test.tsx`
- Renders "Try Demo" button for unauthenticated user
- Calls `enterDemo` and navigates to `/` when Try Demo is clicked (mock `enterDemo` in auth context)

### New: `client/src/components/NavBar.test.tsx`
- Shows demo banner when `isDemoMode` is true
- Shows Exit Demo button in demo mode
- Does not show demo banner when `isDemoMode` is false
- Calls `exitDemo` when Exit Demo is clicked

---

## Critical Gotchas

| Gotcha | Impact | Fix |
|--------|--------|-----|
| Absolute `VITE_API_URL` breaks MSW matching | All API calls bypass MSW in production demo mode | Make `BASE_URL` a getter that returns `""` when `isDemoMode()` |
| Worker not active on F5 refresh | API calls reach Azure and 401; demo appears broken | `main.tsx` checks `isDemoMode()` and restores worker before rendering |
| Double `worker.start()` call | Console warning, possible issues | Guard with `workerStarted` flag in `demoMode.ts` |
| `VITE_DISABLE_MSW=true` in dev/CI | Blocks worker start in development | Demo mode start path must bypass this flag check |
| File upload polling never completes | Upload appears to hang forever | `POST /api/upload/sas-token` handler writes `uploadedAt` immediately to db |

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| `client/src/lib/demoMode.ts` | New | sessionStorage + MSW worker lifecycle |
| `client/src/lib/demoMode.test.ts` | New | Unit tests |
| `client/src/components/NavBar.test.tsx` | New | Demo banner tests |
| `client/src/main.tsx` | Modified | Restore worker on refresh |
| `client/src/contexts/AuthContext.tsx` | Modified | isDemoMode, enterDemo, exitDemo |
| `client/src/pages/LoginPage.tsx` | Modified | Try Demo button |
| `client/src/pages/LoginPage.test.tsx` | Modified | Demo button tests |
| `client/src/components/NavBar.tsx` | Modified | Demo banner + Exit Demo |
| `client/src/lib/api.ts` | Modified | Skip /.auth/me + relative BASE_URL |
| `client/src/mocks/handlers.ts` | Modified | Rich seed data + blob PUT + upload simulation |
