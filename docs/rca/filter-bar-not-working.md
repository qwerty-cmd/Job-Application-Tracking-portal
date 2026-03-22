# RCA: Filter Bar Not Working on Applications Page

**Date:** 2026-03-22
**Reported Symptom:** Selecting a status filter or date range and clicking "Apply" on the Applications page has no visible effect — the table always shows the same data.
**Status:** Fixed — MSW handler updated with full filtering, sorting, and pagination logic. All 55 frontend tests pass.

---

## Root Cause

**The MSW (Mock Service Worker) handler for `GET /api/applications` ignores all query parameters.**

In development mode, MSW intercepts every API request before it reaches the network. The list-applications handler in `client/src/mocks/handlers.ts` (lines 98–112) always returns the full unfiltered in-memory dataset:

```typescript
// Current (broken) handler — ignores all query params
http.get(`${API_BASE}/applications`, () => {
  const items = [...db.values()].filter((a) => !a.isDeleted).map(toSummary);
  return HttpResponse.json({
    data: {
      items,
      pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 },
    },
    error: null,
  });
}),
```

The handler:

- Does **not** read the `status` query parameter → status filtering is ignored
- Does **not** read `from` / `to` query parameters → date range filtering is ignored
- Does **not** read `sortBy` / `sortOrder` → sorting is ignored
- Does **not** read `page` / `pageSize` → pagination is ignored
- Always returns `page: 1, totalPages: 1` hardcoded

**Why MSW is active:** `client/src/main.tsx` enables MSW in development mode by default (lines 12–20). It is only disabled when `VITE_DISABLE_MSW=true` is set. With no `.env` file in the `client/` directory, MSW is always on during `npm run dev`.

---

## Impact Analysis

| Feature                       | Affected? | Reason                               |
| ----------------------------- | --------- | ------------------------------------ |
| Status filter                 | Yes       | `status` query param ignored         |
| Date range filter (From / To) | Yes       | `from`, `to` query params ignored    |
| Sort by column header clicks  | Yes       | `sortBy`, `sortOrder` params ignored |
| Pagination (Prev / Next)      | Yes       | `page`, `pageSize` params ignored    |
| Sort via FilterBar dropdowns  | Yes       | Same root cause                      |

**Not affected:** The real backend (`api/src/functions/listApplications/index.ts`) correctly reads all query parameters and builds a filtered Cosmos DB query. The bug is exclusively in the MSW mock layer used during local development.

---

## Affected Files

| File                           | What's Wrong                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `client/src/mocks/handlers.ts` | `GET /api/applications` handler ignores query params for status, date range, sort, and pagination |

### Files Verified as Correct (no changes needed)

| File                                          | Role                                                                              | Status                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `client/src/components/FilterBar.tsx`         | Captures filter values and calls `onApply` with updated filters                   | Correct — passes `{ ...local, page: 1 }` to parent                                  |
| `client/src/pages/ApplicationsPage.tsx`       | Passes `setFilters` from `useApplications` as the `onApply` callback              | Correct — `setFilters` updates state                                                |
| `client/src/hooks/useApplications.ts`         | Builds query params from `filters` state and passes them to `api.get()`           | Correct — `useEffect` fires on `[filters]` change, builds `params` object correctly |
| `client/src/lib/api.ts`                       | `buildUrl()` appends query params to URL; `api.get()` calls `request("GET", ...)` | Correct — `URLSearchParams` handling is correct                                     |
| `api/src/functions/listApplications/index.ts` | Reads query params, builds Cosmos SQL with `WHERE` clauses and `ORDER BY`         | Correct — parameterized queries with proper filtering, sorting, and pagination      |

---

## Fix Required

Update the MSW `GET /api/applications` handler in `client/src/mocks/handlers.ts` to read query parameters and apply filtering, sorting, and pagination to the in-memory dataset. The handler should mirror the backend's behaviour.

### Specific Changes

**1. Read query parameters from the request URL:**

```typescript
http.get(`${API_BASE}/applications`, ({ request }) => {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const sortBy = url.searchParams.get("sortBy") ?? "dateApplied";
  const sortOrder = url.searchParams.get("sortOrder") ?? "desc";
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(url.searchParams.get("pageSize") ?? "20", 10);
  // ...
}),
```

**2. Apply status filter:**

```typescript
let results = [...db.values()].filter((a) => !a.isDeleted);
if (status) {
  results = results.filter((a) => a.status === status);
}
```

**3. Apply date range filter:**

```typescript
if (from) {
  results = results.filter((a) => a.dateApplied >= from);
}
if (to) {
  results = results.filter((a) => a.dateApplied <= to);
}
```

**4. Apply sorting:**

```typescript
results.sort((a, b) => {
  const aVal = a[sortBy as keyof Application] as string;
  const bVal = b[sortBy as keyof Application] as string;
  if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
  if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
  return 0;
});
```

**5. Apply pagination:**

```typescript
const totalItems = results.length;
const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
const offset = (page - 1) * pageSize;
const pageItems = results.slice(offset, offset + pageSize).map(toSummary);

return HttpResponse.json({
  data: {
    items: pageItems,
    pagination: { page, pageSize, totalItems, totalPages },
  },
  error: null,
});
```

### Additional MSW Handler Fix (lower priority)

The `GET /api/applications/stats` handler also ignores `from` / `to` query parameters. It should filter by date range when those params are present, to match the real backend behaviour. This affects the Dashboard page date filter.

---

## Workaround (immediate)

Set `VITE_DISABLE_MSW=true` and `VITE_API_URL=http://localhost:7071` in a `client/.env.development.local` file, then run `func start` in the `api/` directory. This bypasses MSW and sends requests to the real backend.

```bash
# client/.env.development.local
VITE_DISABLE_MSW=true
VITE_API_URL=http://localhost:7071
```

---

## Verification Plan

After the fix:

1. Run `npm run dev` in `client/` (MSW active)
2. Create 3+ applications with different statuses and dates
3. Select a specific status (e.g., "Applying") → click Apply → only matching applications should appear
4. Set a date range → click Apply → only applications within range should appear
5. Click column headers → table should sort accordingly
6. Verify pagination shows correct counts and page navigation works
7. Run `npx vitest run` in `client/` — all existing tests must still pass
