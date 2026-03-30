# V2: Public Demo Mode — Architecture

---

## The Big Picture

The app has two modes. Everything else in this document explains how we switch between them and what that switch actually does.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  OWNER MODE                                                                 │
│                                                                             │
│  You log in with GitHub → Azure validates you → your data lives in         │
│  Cosmos DB and Blob Storage in the cloud.                                   │
│                                                                             │
│  Browser ──► Azure SWA (auth) ──► Azure Functions ──► Cosmos DB            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  DEMO MODE                                                                  │
│                                                                             │
│  Visitor clicks "Try Demo" → no login → data lives only in the browser     │
│  tab's memory. Azure is never contacted.                                    │
│                                                                             │
│  Browser ──► MSW Service Worker (intercepts) ──► in-memory JavaScript Map  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## What is the MSW Service Worker?

MSW (Mock Service Worker) is a library that registers a **service worker** in the browser. A service worker is a separate JavaScript thread that the browser runs alongside your app. Its job here is to sit between the app and the network and intercept API calls.

```
WITHOUT service worker:

  React app                                         Azure
  ─────────────────────────────────────────────────────────
  fetch("/api/applications")  ─────────────────►  Functions
                              ◄─────────────────  { data: [...] }


WITH service worker registered (demo mode):

  React app          Service Worker                 Azure
  ───────────────────────────────────────────────────────────
  fetch("/api/       ──► "I have a handler          (never
   applications")        for /api/applications"      reached)
                         runs the handler
                     ◄── { data: [...] }  (from memory)
```

The service worker only exists when it has been **registered**. Registration is controlled by a single flag in `sessionStorage`.

---

## The One Flag That Controls Everything

```
sessionStorage key:  "demo_mode"
value:               "true" or not present


  "demo_mode" = not present
        │
        ▼
  main.tsx: don't start MSW worker
        │
        ▼
  No service worker in browser
        │
        ▼
  All fetch() calls go to Azure  →  owner mode


  "demo_mode" = "true"
        │
        ▼
  main.tsx: start MSW worker   ← this is the only thing that matters
        │
        ▼
  Service worker registered in browser
        │
        ▼
  All fetch("/api/...") calls intercepted  →  demo mode
```

Everything else — the `isDemoMode` boolean in `AuthContext`, the demo banner in `NavBar`, the `identityProvider: "demo"` on the user object — is just **UI logic** that reads from this same flag or its consequences.

---

## How the Flag Gets Set: "Try Demo" Click

Step by step, starting from the button click:

```
1. Visitor clicks [Try Demo] on LoginPage
   │
   │  LoginPage calls: await enterDemo()
   ▼

2. enterDemo() runs inside AuthContext
   │
   ├─── Step A: start the MSW worker
   │      │
   │      │  demoMode.ts: startDemoWorker()
   │      │     └─ dynamic import("./mocks/browser")
   │      │            └─ worker.start()
   │      │                  └─ browser registers the service worker
   │      │                     FROM NOW ON: all fetch("/api/...") is intercepted
   │      │
   ├─── Step B: write the flag
   │      │
   │      │  sessionStorage.setItem("demo_mode", "true")
   │      │     └─ this survives a page refresh (F5) within the same tab
   │      │        it does NOT survive closing the tab
   │      │
   ├─── Step C: clear the auth cache
   │      │
   │      │  invalidatePrincipalCache()
   │      │     └─ api.ts caches the result of /.auth/me
   │      │        we clear it so the next check goes through MSW
   │      │
   └─── Step D: set a fake user in React state
              │
              │  setUser({
              │    identityProvider: "demo",
              │    userId: "demo-user",
              │    userDetails: "Demo Visitor",
              │    userRoles: ["authenticated", "owner"]   ← owner role = gets past ProtectedRoute
              │  })
              │
              └─ React re-renders
                    │
                    └─ isOwner = true (user has "owner" in roles)
                    └─ isDemoMode = true (identityProvider is "demo")

3. enterDemo() resolves
   │
   │  LoginPage calls: navigate("/")
   ▼

4. ProtectedRoute checks: isOwner? YES → renders ApplicationsPage
   │
   ▼

5. ApplicationsPage calls: fetch("/api/applications")
   │
   ▼

6. Service worker intercepts → returns 7 seeded applications from memory
   │
   ▼

7. App renders with demo data. Azure never contacted.
```

---

## What's in Memory: The In-Memory Database

`handlers.ts` contains a JavaScript `Map` called `db`. This is the entire "database" for demo mode. It lives in browser memory.

```
handlers.ts

  const db: Map<string, Application> = new Map()

  // Pre-seeded on load:
  db.set("app-1", { company: "Contoso Ltd",      status: "Interview Stage", ... })
  db.set("app-2", { company: "Fabrikam Corp",     status: "Accepted",        ... })
  db.set("app-3", { company: "Northwind Inc",     status: "Rejected",        ... })
  db.set("app-4", { company: "Litware Solutions", status: "Recruiter Screening", ... })
  db.set("app-5", { company: "Adventure Works",   status: "App Submitted",   ... })
  db.set("app-6", { company: "Tailspin Toys",     status: "Withdrawn",       ... })
  db.set("app-7", { company: "Woodgrove Bank",    status: "Applying",        ... })


  When a handler runs:

  http.get("/api/applications", () => {
    const items = [...db.values()]   ← reads from the Map
    return HttpResponse.json({ data: { items } })
  })

  http.post("/api/applications", async ({ request }) => {
    const body = await request.json()
    db.set(newId, { ...body })       ← writes to the Map
    return HttpResponse.json({ data: newApp }, { status: 201 })
  })
```

When the tab closes, the `Map` is gone. When the tab refreshes (F5), the `Map` resets to the original 7 seeded applications because `handlers.ts` is re-evaluated from scratch.

---

## What Happens on Page Refresh (F5)

F5 destroys the current JavaScript context entirely, including the MSW worker. But `sessionStorage` survives.

```
User presses F5
│
▼
Browser destroys the current tab context
  - React app gone
  - MSW worker gone
  - db Map gone (resets to seed data on next load)
  - sessionStorage survives ← this is the only thing that persists
│
▼
Browser loads the page fresh
│
▼
main.tsx runs (before React renders):

  async function enableMocking() {
    // existing dev check
    if (import.meta.env.MODE === "development") { ... }

    // NEW: demo mode check
    if (isDemoMode()) {                        ← reads sessionStorage
      await startDemoWorker()                  ← restores the worker
    }
  }

  enableMocking().then(() => {
    // React renders here — worker is already active
    createRoot(...).render(...)
  })
│
▼
Worker is active before React renders
│
▼
AuthContext mounts → checkAuth() runs → fetch("/.auth/me")
│
└─ MSW intercepts /.auth/me → returns demo principal with owner role
│
▼
isOwner = true → ProtectedRoute passes → app loads
```

Without the `enableMocking()` change, pressing F5 in demo mode would:
1. Kill the worker (page reload)
2. `sessionStorage` still says `"demo_mode": "true"`
3. React renders, `checkAuth()` fetches `/.auth/me`
4. No worker → real network call → Azure SWA → no session → `null` principal
5. `isOwner = false` → redirect to login page
6. Demo appears broken

---

## How api.ts Knows to Use Relative URLs

`api.ts` currently does:

```ts
const BASE_URL = import.meta.env.VITE_API_URL ?? ""
// in production: BASE_URL = "https://func-jobtracker.azurewebsites.net"

fetch(BASE_URL + "/api/applications")
// produces: "https://func-jobtracker.azurewebsites.net/api/applications"
```

MSW handlers are registered as:

```ts
http.get("/api/applications", ...)
// this pattern is a RELATIVE path
```

The MSW service worker compares the full fetch URL against handler patterns. An absolute URL (`https://func-...`) does not match a relative pattern (`/api/...`). So the worker lets the request through to Azure — which means demo mode silently breaks for anyone visiting the deployed app.

The fix: in demo mode, force `BASE_URL` to `""` so the fetch URL becomes relative:

```ts
// BEFORE (const — set once at module load):
const BASE_URL = import.meta.env.VITE_API_URL ?? ""

// AFTER (function — evaluated on each call):
function getBaseUrl(): string {
  if (isDemoMode()) return ""   // relative → MSW intercepts ✓
  return import.meta.env.VITE_API_URL ?? ""
}

fetch(getBaseUrl() + "/api/applications")
// demo mode:  "/api/applications"                          → MSW intercepts ✓
// owner mode: "https://func-jobtracker.../api/applications" → Azure ✓
```

---

## How Exiting Demo Works

```
Visitor clicks [Exit Demo] in NavBar
│
▼
exitDemo() in AuthContext
│
├─ 1. worker.stop()
│       └─ service worker deregistered from browser
│          fetch() calls will now go to the network again
│
├─ 2. sessionStorage.removeItem("demo_mode")
│       └─ flag cleared — next page load won't start the worker
│
├─ 3. invalidatePrincipalCache()
│       └─ clears the cached demo principal in api.ts
│
└─ 4. window.location.href = "/login"
        └─ full page reload (not React navigate)
           everything resets cleanly:
           - React state gone
           - db Map gone
           - no worker (flag is cleared)
           │
           ▼
        main.tsx runs enableMocking()
           └─ isDemoMode() = false → worker NOT started
                  │
                  ▼
           AuthContext.checkAuth() → fetch("/.auth/me") → Azure SWA
                  └─ no session → null principal → LoginPage
```

A full page reload is used (not React's `navigate()`) because it guarantees a completely clean slate — no leftover React state, no stale references to the now-stopped worker.

---

## The Complete Picture: All Moving Parts

```
                        sessionStorage
                        "demo_mode" = "true"
                               │
                               │ read by
                     ┌─────────┴──────────┐
                     │                    │
                     ▼                    ▼
               main.tsx              api.ts
               (on page load)        (on each request)
                     │                    │
                     │ starts             │ forces
                     ▼                    ▼
              MSW worker            BASE_URL = ""
              registered            (relative URLs)
                     │                    │
                     └────────┬───────────┘
                              │
                              ▼
                   fetch("/api/applications")
                              │
                   Service worker intercepts
                              │
                              ▼
                     handlers.ts runs
                              │
                     reads/writes db Map
                              │
                              ▼
                   Returns JSON to React app
                   (Azure never contacted)


  Meanwhile in React:

  AuthContext
  ├─ user.identityProvider = "demo"
  ├─ isOwner = true           → ProtectedRoute lets user through
  └─ isDemoMode = true        → NavBar shows demo banner
```

---

## What Does NOT Change

```
Azure Functions    — zero changes. They don't know demo mode exists.
Cosmos DB          — never touched in demo mode.
Blob Storage       — never touched in demo mode.
CI/CD workflows    — no changes.
All React pages    — ApplicationsPage, DashboardPage etc. have no demo awareness.
                     They just call api.ts as normal and get responses back.
ProtectedRoute     — no change needed. Demo user has the "owner" role so it passes.
App.tsx routing    — no change.
```

The pages have no idea they're in demo mode. They call `api.ts`, `api.ts` calls `fetch()`, and `fetch()` either hits Azure or hits MSW depending on whether the worker is registered. That's the entire mechanism.
