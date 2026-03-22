# Frontend Development Workflow

> **Date:** 2026-03-22
> **Applies to:** Phase 4 (Frontend — React + TypeScript)

---

## Why Frontend Workflow Differs from Backend

The backend (Phase 2–3) used **strict test-driven development**: write failing tests first, then implement to make them pass. This works because each Azure Function is a pure input/output unit — request in, JSON out, easily assertable.

Frontend code has **visual output**, **user interaction flows**, and **async state** that make pure test-first impractical:

| Concern          | Backend                        | Frontend                                                |
| ---------------- | ------------------------------ | ------------------------------------------------------- |
| **Output**       | JSON response — easy to assert | Rendered DOM — need to find elements, check visibility  |
| **State**        | Stateless per request          | Persistent state (loading → loaded → error), re-renders |
| **Dependencies** | Cosmos client, Storage client  | API calls, browser APIs, routing, user events           |
| **Iteration**    | Run test, see pass/fail        | Need to **see it visually** — layout, spacing           |
| **Granularity**  | 1 test = 1 endpoint behaviour  | 1 test = 1 user interaction, but UI must exist first    |

---

## Frontend Workflow: Build-First, Then Test

```
Backend (Phase 2–3):     Spec → test-writer → implementer → reviewer
Frontend (Phase 4):      Spec → fe-builder → fe-test-writer → reviewer
```

### Agent Roles

| Agent               | Role                                   | File Scope                  |
| ------------------- | -------------------------------------- | --------------------------- |
| **@fe-builder**     | Builds components matching wireframes  | `client/src/` (source only) |
| **@fe-test-writer** | Writes tests for existing components   | `client/src/**/*.test.tsx`  |
| **@reviewer**       | Read-only security + consistency audit | All files (read-only)       |

### Per-Page Workflow

For each page (Applications List → Detail → Dashboard → Deleted):

```
Step 1: @fe-builder builds the component with proper structure and API wiring
Step 2: Visually verify in browser (npm run dev)
Step 3: @fe-test-writer writes tests for the built component
Step 4: Run tests to confirm they pass
Step 5: @reviewer audits the page for security and spec consistency
```

### Example: Applications Table Page

| Step | What                                                                                | Agent           |
| ---- | ----------------------------------------------------------------------------------- | --------------- |
| 1    | Build `ApplicationsTable` — sortable headers, rows, pagination, filters             | @fe-builder     |
| 2    | Wire `useApplications()` hook → `GET /api/applications`                             | @fe-builder     |
| 3    | Visual check in browser                                                             | Manual          |
| 4    | Write tests: renders rows, click sorts, click navigates, empty state, loading state | @fe-test-writer |
| 5    | Security + spec review                                                              | @reviewer       |

---

## Comparison: Backend vs Frontend Agents

| Backend Agent    | Frontend Equivalent | Key Difference                                                        |
| ---------------- | ------------------- | --------------------------------------------------------------------- |
| **@test-writer** | **@fe-test-writer** | Backend writes tests BEFORE code exists; frontend writes tests AFTER  |
| **@implementer** | **@fe-builder**     | Backend implements to pass tests; frontend builds to match wireframes |
| **@reviewer**    | **@reviewer**       | Same agent — now covers both backend and frontend checklists          |

---

## Testing Stack

| Tool                            | Role                | Why                                                            |
| ------------------------------- | ------------------- | -------------------------------------------------------------- |
| **Vitest**                      | Test runner         | Already used for backend — one runner for all                  |
| **React Testing Library**       | Component rendering | Tests user behaviour, not implementation details               |
| **MSW (Mock Service Worker)**   | API mocking         | Intercepts fetch at network level — real fetch, mock responses |
| **@testing-library/user-event** | User simulation     | Realistic clicks, typing, tabbing                              |
| **jsdom**                       | DOM environment     | Browser DOM simulation in Node.js                              |

### Testing Principle: Test What Users See and Do

```tsx
// ✅ Good — tests user-visible behaviour
expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
expect(screen.getByRole("button", { name: /create/i })).toBeEnabled();
await userEvent.click(screen.getByText("Contoso Ltd"));

// ❌ Bad — tests implementation details
expect(component.state.isLoading).toBe(false);
expect(wrapper.find("InternalComponent")).toHaveLength(1);
```

### Test Layers

| Layer             | Tool                | What it tests                                      |
| ----------------- | ------------------- | -------------------------------------------------- |
| **Component**     | Vitest + RTL + MSW  | Individual component renders and responds to input |
| **Integration**   | Vitest + RTL + MSW  | Full page: form submit → API call → UI update      |
| **E2E (Phase 6)** | Playwright (future) | Full browser: login → create → edit → delete       |

---

## What Stays the Same

- **Test runner:** Vitest (shared with backend)
- **API contract:** All tests assert against the same `{ data, error }` response shape
- **Validation rules:** Zod schemas on frontend mirror backend validation
- **Review process:** @reviewer agent with read-only analysis, severity-based findings

## What's New

- **Visual verification:** `npm run dev` and check the browser — tests can't catch "this looks wrong"
- **MSW mock server:** Shared `client/src/mocks/` with handlers mirroring real API responses
- **React patterns:** Hooks, context providers, router wrappers needed in test setup
- **Provider wrapping:** Components wrapped in `<BrowserRouter>`, `<QueryClientProvider>`, etc. during tests
- **Shared test utility:** `client/src/test-utils.tsx` provides `renderWithProviders()` helper

---

## Build Order (Phase 4 Sequence)

| Step | Scope                                      | Dependencies |
| ---- | ------------------------------------------ | ------------ |
| 1    | Scaffold: Vite + React + Tailwind + Shadcn | None         |
| 2    | Shell: routing, nav bar, auth guard        | Step 1       |
| 3    | MSW mock server setup                      | Step 1       |
| 4    | Shared: API client, types, auth context    | Steps 1–2    |
| 5    | Applications List page (table view)        | Steps 2–4    |
| 6    | Create Application modal                   | Steps 4–5    |
| 7    | Application Detail page                    | Steps 4–5    |
| 8    | Dashboard page                             | Steps 2–4    |
| 9    | Deleted Applications page                  | Steps 2–4    |
| 10   | File upload/download UI                    | Step 7       |
| 11   | Interview management UI                    | Step 7       |
| 12   | Tests for all pages                        | Steps 5–11   |
| 13   | Final review                               | Step 12      |
