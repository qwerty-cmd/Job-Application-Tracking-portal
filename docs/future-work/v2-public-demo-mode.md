# V2: Public Demo Mode

## Goal

Make the repo public for portfolio showcase without exposing Azure resources or incurring cloud costs. Unauthenticated visitors can explore the full app with data that lives only for their browser session.

---

## User Flow

1. Visitor lands on the login page
2. They see two options: "Sign in with GitHub" (owner) and "Try Demo (no login required)"
3. Clicking "Try Demo" activates demo mode and drops them into the app
4. A persistent banner reads: "Demo Mode — data is not saved between sessions"
5. They can do everything: create applications, add interviews, view the dashboard, upload files
6. Data lives only in memory for that browser tab; closing the tab resets everything
7. An "Exit Demo" button on the nav returns them to the login page

---

## Architecture

### Why MSW

The project already has a fully functional in-memory API implementation in `client/src/mocks/handlers.ts`. It covers all 16 endpoints including CRUD, interviews, file operations, and stats. The MSW service worker (`client/public/mockServiceWorker.js`) is already in `public/` and can run in production, not just dev.

Demo mode = activate MSW service worker in the browser. Zero backend calls, zero Azure cost.

### Changes Required

| File | Change |
|------|--------|
| `client/src/pages/LoginPage.tsx` | Add "Try Demo" button alongside the GitHub sign-in button |
| `client/src/contexts/AuthContext.tsx` | Add `isDemoMode` state, `enterDemoMode()` / `exitDemoMode()` functions; read/write `sessionStorage` to persist flag within the tab |
| App entry point (`main.tsx`) | On startup, check `sessionStorage` for demo flag; if set, start MSW service worker before rendering |
| `client/src/components/ProtectedRoute.tsx` | Allow access when `isDemoMode` is true (bypass `isOwner` check) |
| `client/src/components/NavBar.tsx` | Show "Demo Mode — data is not saved" banner and "Exit Demo" button |
| `client/src/mocks/handlers.ts` | Seed 6–8 varied applications across different statuses for a compelling demo; currently only 1 |
| MSW handlers (file upload/download) | Fake the blob storage PUT as 201 OK; mock download SAS returns a placeholder |

### No Backend Changes Needed

Demo mode is 100% client-side. No new Azure resources, no Cosmos DB partitioning, no new Function endpoints.

---

## Data Seeding

For the demo to be compelling, pre-seed the MSW in-memory store with realistic data:

- 2–3 applications in active stages (Interview Stage, Recruiter Screening)
- 1–2 rejections with reasons and interview history
- 1 accepted offer
- 1 in "Applying" with no response yet
- A mix of file attachments (mocked), interview rounds, and notes

This gives visitors a realistic dashboard with charts and stats populated on first load.

---

## File Uploads in Demo Mode

The existing upload SAS token mock returns a fake URL. The actual blob PUT would fail with a network error. Solution: add an MSW handler that intercepts `PUT` requests to `*.blob.core.windows.net` and returns a 201 OK. The frontend polling logic will then detect the "upload" as complete.

Downloads similarly return a placeholder PDF or a browser-friendly message.

---

## Exiting Demo Mode

- "Exit Demo" button in NavBar → clears `sessionStorage` flag, stops MSW worker, redirects to `/login`
- Closing/refreshing the tab naturally clears sessionStorage — no cleanup needed

---

## Out of Scope for V2

- No server-side demo sessions
- No rate limiting or abuse protection (it's all client-side)
- No demo data persistence between tabs or devices
