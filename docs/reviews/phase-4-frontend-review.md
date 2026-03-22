# Phase 4 — Frontend (React): Build Challenges & Code Review

**Date:** 2026-03-22
**Phase:** 4 — Frontend (React + TypeScript with Vite)
**Scope:** All React components, pages, hooks, API client, auth context, MSW test infrastructure, 35 tests across 5 files

---

## Part 1: Build Difficulties Encountered

### D-1: Shadcn/ui Select `onValueChange` Signature (base-ui)

**Symptom:** TypeScript errors on every `<Select onValueChange={...}>` usage. The handler callback received `(value: string | null, eventDetails)` but code assumed `(value: string)`.

**Root Cause:** This project uses Shadcn/ui backed by **base-ui** (not Radix UI). The base-ui Select component's `onValueChange` callback passes `null` when the selection is cleared, unlike Radix's `(value: string)` signature.

**Fix:** Added null checks to all Select handlers:

```tsx
onValueChange={(val) => setWorkMode((val ?? "") as WorkMode | "")}
```

**Lesson:** Always check the actual component library API — Shadcn/ui can be backed by either Radix or base-ui, and their APIs differ.

---

### D-2: react-hook-form `handleSubmit` Type Mismatch

**Symptom:** TypeScript error when destructuring `handleSubmit` from `useForm()` and using it with `onSubmit={handleSubmit(onFormSubmit)}`.

**Root Cause:** Destructuring `{ handleSubmit }` from `useForm()` lost type inference, causing a `SubmitHandler<FormValues>` type mismatch with the function signature.

**Fix:** Use `form.handleSubmit()` (non-destructured) pattern:

```tsx
const form = useForm<FormValues>({ ... });
// Later:
<form onSubmit={form.handleSubmit(handleFormSubmit)}>
```

**Lesson:** Prefer accessing methods through the form object rather than destructuring when TypeScript inference breaks.

---

### D-3: Vitest Worker Fork Timeout

**Symptom:** Tests hanging for 60+ seconds then timing out with `Error: Worker exited unexpectedly` when using the default `--pool=forks` option.

**Root Cause:** System resource exhaustion — many terminal sessions open simultaneously caused forked worker processes to starve. The `forks` pool creates separate Node.js processes which are heavier than threads.

**Fix:** Always run tests with `--pool=threads` flag:

```bash
npx vitest run --pool=threads
```

**Lesson:** On resource-constrained machines, prefer `--pool=threads` over `--pool=forks` for faster, more reliable test execution.

---

### D-4: Tailwind CSS v4 Configuration

**Symptom:** Tailwind classes not applying — components rendered without any styling.

**Root Cause:** Tailwind CSS v4 uses a different configuration model than v3. It uses the `@tailwindcss/vite` plugin directly instead of a `tailwind.config.js` file with postcss.

**Fix:** Used the `@tailwindcss/vite` Vite plugin and CSS `@import "tailwindcss"` directive instead of the v3 `@tailwind` directives.

**Lesson:** Tailwind v4 has a significantly different setup from v3 — no `tailwind.config.js`, no postcss config, uses native CSS imports.

---

## Part 2: Test Failures (Layer 6) — 14 of 35 Tests Failing

### T-1: MSW Handler Ordering — Route Collision (12 failures)

**Files:** `client/src/mocks/handlers.ts`
**Symptom:** DashboardPage, DeletedApplicationsPage, and several other tests failed with 404 errors or unexpected data. The MSW handlers returned "Application stats not found" or "Application deleted not found".

**Root Cause:** MSW matches handlers in registration order. The parameterized handler `GET /api/applications/:id` was registered **before** the literal handlers `GET /api/applications/stats` and `GET /api/applications/deleted`. MSW matched `:id` as `"stats"` and `"deleted"`, routing those requests to the wrong handler (which returned 404 for unknown IDs).

**Handler order before fix:**

```ts
http.get("/api/applications", ...)      // list
http.get("/api/applications/:id", ...)  // get by ID ← catches /stats and /deleted!
// ... later ...
http.get("/api/applications/stats", ...)   // never reached
http.get("/api/applications/deleted", ...) // never reached
```

**Fix:** Moved the `/stats` and `/deleted` handlers to be registered **before** the `/:id` handler. MSW now matches literal paths first:

```ts
http.get("/api/applications", ...)        // list
http.get("/api/applications/stats", ...)  // stats (literal, matched first)
http.get("/api/applications/deleted", ...) // deleted (literal, matched first)
http.get("/api/applications/:id", ...)    // get by ID (parameterized, fallback)
```

**Lesson:** In MSW (and most routing frameworks), literal routes must be declared before parameterized routes to avoid unintended matches.

---

### T-2: Synchronous Loading State Assertions (2 failures)

**Files:** `ApplicationsPage.test.tsx`, `DashboardPage.test.tsx`
**Symptom:** `expect(screen.getByText(/loading.../i)).toBeInTheDocument()` failed — the text wasn't in the DOM at assertion time.

**Root Cause:** The test rendered `<App />` which wraps pages in `<ProtectedRoute>`. ProtectedRoute shows its own "Loading…" text while the auth check (MSW `/.auth/me` call) resolves. By the time auth resolved and the actual page component mounted, the MSW data handler had already returned, so the page-level loading state was never visible — the page went straight to showing data.

**Fix:** Used `server.use()` to override the relevant data handler with a delayed response, ensuring the page loading state was visible before data arrived:

```tsx
it("shows loading state initially", async () => {
  server.use(
    http.get("/api/applications", async () => {
      await new Promise((r) => setTimeout(r, 200));
      return HttpResponse.json({ data: { items: [], pagination: {...} }, error: null });
    }),
  );
  renderApp();
  await waitFor(() => {
    expect(screen.getByText(/loading applications/i)).toBeInTheDocument();
  });
});
```

**Lesson:** When testing loading states in apps with auth layers, the auth resolution time can mask component loading states. Delay the data response to ensure the loading state is observable.

---

### T-3: Multiple Elements with Same Text (1 failure)

**File:** `DashboardPage.test.tsx`
**Symptom:** `getByText("Rejected")` threw `Found multiple elements with the text: Rejected`.

**Root Cause:** "Rejected" appeared in two places on the Dashboard page:

1. SummaryCards component — card title "Rejected"
2. StatusChart component — status label "Rejected"

`getByText` expects exactly one match.

**Fix:** Switched to `getAllByText` with a length assertion:

```tsx
expect(screen.getAllByText("Rejected").length).toBeGreaterThanOrEqual(1);
```

**Lesson:** When text appears in multiple components on the same page, use `getAllByText` or scope queries with `within()` to avoid ambiguity.

---

### T-4: Emoji Characters Breaking Text Matching (5 failures)

**Files:** `DeletedApplicationsPage.test.tsx`
**Symptom:** `getByText(/recently deleted/i)` failed even though the heading clearly contained that text.

**Root Cause:** The heading rendered as `🗑 Recently Deleted`. The emoji character (U+1F5D1) rendered differently in jsdom than in a real browser, breaking the regex match against the text node content.

Similarly, `getByText("DeletedCorp")` failed because the card title used `{app.company} &middot; {app.role}`, which rendered as `DeletedCorp · Removed Role` — the `&middot;` HTML entity created a single text node with the middot character, but RTL's `getByText` with exact match expected just `"DeletedCorp"` as the full text content.

**Fix:**

- For emoji headings: Use `getByRole("heading", { name: /recently deleted/i })` which matches the accessible name (ignoring emoji rendering quirks)
- For middot-separated text: Use function matchers with `content.includes()`:

```tsx
expect(
  screen.getByText((content) => content.includes("DeletedCorp")),
).toBeInTheDocument();
```

**Lesson:** Emoji and HTML entities can cause text matching issues in jsdom. Prefer role-based queries (`getByRole`) or function matchers over exact text matching when special characters are involved.

---

## Part 3: Code Review (Layer 7) — Issues Found & Fixed

### Critical Issues

#### C-1: `window.open` Without `noopener`/`noreferrer` — Reverse Tabnapping

**Files:** `DetailFields.tsx` (L189), `useMutations.ts` (L276)
**Issue:** Both `window.open()` calls passed user-controlled URLs without security attributes:

```tsx
// Before
window.open(jobPostingUrl, "_blank");
window.open(res.data.downloadUrl, "_blank");
```

The opened page gets a reference to `window.opener` and can navigate the parent window (reverse tabnapping). The `jobPostingUrl` is fully user-controlled input.

**Fix:**

```tsx
// After
window.open(jobPostingUrl, "_blank", "noopener,noreferrer");
window.open(res.data.downloadUrl, "_blank", "noopener,noreferrer");
```

---

#### C-2: Upload Polling Interval Never Cleaned Up on Unmount

**File:** `ApplicationDetailPage.tsx` (L113-L119)
**Issue:** After a successful file upload, a `setInterval` polled for Cosmos updates every 2 seconds for up to 14 seconds. If the user navigated away during polling, the interval continued firing `refetch()` on an unmounted component — causing memory leaks and unnecessary API calls.

```tsx
// Before — interval ID not stored, no cleanup
const interval = setInterval(() => {
  attempts++;
  refetch();
  if (attempts >= 7) clearInterval(interval);
}, 2000);
```

**Fix:** Stored interval ID in a `useRef` and added cleanup in a `useEffect`:

```tsx
const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

useEffect(() => {
  return () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
  };
}, []);

// In handleUpload:
if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
pollIntervalRef.current = setInterval(() => { ... }, 2000);
```

---

#### C-3: Missing "Access Denied" State — Auth Redirect Loop

**File:** `LoginPage.tsx`
**Issue:** When a user is authenticated via GitHub but doesn't have the `owner` role, `ProtectedRoute` redirects them to `/login`. The `LoginPage` only checked `isOwner` — a non-owner saw the "Sign in with GitHub" button, clicked it, SWA recognised the existing session, redirected back, `ProtectedRoute` redirected to `/login` again — infinite loop.

**Fix:** Added an `isAuthenticated && !isOwner` check that shows "Access Denied" instead of the sign-in button:

```tsx
if (isAuthenticated && !isOwner) {
  return (
    <div>
      <h1>Access Denied</h1>
      <p>This app is private. You don't have the required permissions.</p>
    </div>
  );
}
```

---

### High Issues

#### H-1: `DetailFields` Does Not Re-sync State After Save

**File:** `DetailFields.tsx` (L26-L45)
**Issue:** All field values were initialized from `application` via `useState()`, but never updated when `application` changed (e.g., after PATCH → refetch). After saving changes and getting updated data from the server, local state held stale values — the `hasChanges` dirty check broke.

**Fix:** Added `key={application.updatedAt}` on `<DetailFields>` in `ApplicationDetailPage.tsx` to force remount when data changes.

---

#### H-2: `RejectionSection` Same Stale State Issue

**File:** `RejectionSection.tsx` (L26-L29)
**Issue:** Same as H-1 — `useState` initialized from props but didn't track changes after refetch.

**Fix:** Added `key={application.updatedAt}` on `<RejectionSection>`.

---

#### H-3: `InterviewModal` Form Defaults Frozen at First Render

**File:** `InterviewModal.tsx` (L54-L63)
**Issue:** `useForm({ defaultValues: ... })` sets defaults once. When opening the modal to edit a _different_ interview, the form retained the previous interview's values because `defaultValues` are only applied on first render.

**Fix:** Added `key={editingInterview?.id ?? "new"}` on `<InterviewModal>` to force a fresh form instance when switching between interviews.

---

#### H-5: Download URL Opened Without Protocol Validation

**File:** `useMutations.ts` (L273-L279)
**Issue:** `window.open(res.data.downloadUrl)` opened any URL from the API response without verifying it was a legitimate blob storage URL. A compromised API could inject a malicious URL.

**Fix:** Added protocol check before opening:

```tsx
if (res.data?.downloadUrl && res.data.downloadUrl.startsWith("https://")) {
  window.open(res.data.downloadUrl, "_blank", "noopener,noreferrer");
}
```

---

### Medium Issues (Documented, Not Fixed)

| ID  | Issue                                                      | File                         | Decision                                                  |
| --- | ---------------------------------------------------------- | ---------------------------- | --------------------------------------------------------- |
| M-1 | Missing drag-and-drop reorder for interviews               | `InterviewList.tsx`          | Feature work — deferred to polish phase                   |
| M-2 | Login page text differs from wireframe                     | `LoginPage.tsx`              | **Fixed** — updated text + added "Private app" note       |
| M-3 | Empty state for Applications table doesn't match wireframe | `ApplicationsTable.tsx`      | **Fixed** — added empty state with CTA button             |
| M-7 | Missing ARIA labels on table sort buttons                  | `ApplicationsTable.tsx`      | **Fixed** — added `aria-sort`, keyboard handler, tabIndex |
| M-8 | Missing ARIA labels on file indicators (✓/✗)               | `ApplicationsTable.tsx`      | **Fixed** — added `aria-label` on file indicator spans    |
| M-9 | `today()` uses UTC timezone                                | `CreateApplicationModal.tsx` | **Fixed** — switched to `toLocaleDateString("en-CA")`     |

---

### Low Issues (Documented, Not Fixed)

| ID  | Issue                                                                  | File                          | Decision                                        |
| --- | ---------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------- |
| L-1 | `isRestoring` flag shared across all deleted app cards                 | `DeletedApplicationsPage.tsx` | **Fixed** — track `restoringId` per-card        |
| L-3 | No `LoginPage.test.tsx` test file                                      | `pages/`                      | Add when Access Denied flow needs testing       |
| L-4 | Emoji-based icons render inconsistently across platforms               | Multiple                      | **Fixed** — replaced with Lucide React icons    |
| H-4 | Create modal sends `status: "Applying"` (redundant — backend enforces) | `CreateApplicationModal.tsx`  | **Fixed** — removed redundant status field      |
| H-6 | Validation error `details` array not surfaced in toast                 | Multiple pages                | **Fixed** — `formatApiError` helper in utils.ts |

---

### Test Coverage Gaps (Documented)

| ID   | Gap                                                                  | Priority                                                                    |
| ---- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| T-1  | No `LoginPage.test.tsx` — auth flow states                           | High                                                                        |
| T-2  | No tests for file upload flow (SAS token → XHR → progress → polling) | High                                                                        |
| T-3  | No tests for file download flow                                      | Medium                                                                      |
| T-4  | No tests for file delete with confirmation dialog                    | Medium                                                                      |
| T-5  | No tests for status change → rejection section appearance            | Medium                                                                      |
| T-6  | No tests for FilterBar interaction (apply/reset)                     | Medium                                                                      |
| T-7  | No tests for create form validation (invalid URL, future date)       | Medium                                                                      |
| T-8  | No tests for interview edit modal (pre-populated values)             | Medium                                                                      |
| T-12 | Missing MSW handlers for file delete, interview update/delete        | **Fixed** — added handlers for PATCH/DELETE interview, reorder, DELETE file |

---

## Summary

| Category                        | Found              | Fixed    | Deferred    |
| ------------------------------- | ------------------ | -------- | ----------- |
| Build Difficulties              | 4                  | 4        | 0           |
| Test Failures                   | 14 (4 root causes) | 14       | 0           |
| Critical (security/correctness) | 3                  | 3        | 0           |
| High (should fix)               | 6                  | 6        | 0           |
| Medium                          | 9                  | 6        | 1 (M-1)     |
| Low                             | 5                  | 3        | 1 (L-3)     |
| Test Coverage Gaps              | 12                 | 1 (T-12) | 7 (T-1–T-8) |

**Final state:** 35 tests passing, 0 TypeScript errors, all Critical, High, and most Medium/Low issues resolved. Only M-1 (drag-and-drop) deferred as feature work, L-3 (login tests) deferred to future, and T-1–T-8 test coverage gaps noted for future work.
