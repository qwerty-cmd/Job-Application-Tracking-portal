---
description: "TDD cycle for a single API endpoint. Writes tests, implements, and reviews."
agent: "agent"
argument-hint: "Endpoint name, e.g. createApplication or POST /api/applications"
---

Run a full TDD cycle for the endpoint: $ARGUMENTS

## Phase 1: Red (Write Failing Tests)

1. Read the endpoint contract from [docs/project/CLAUDE.md](../../docs/project/CLAUDE.md) — find the request/response shapes, validation rules, status codes, and business logic
2. Create a test file at `api/functions/<functionName>/<functionName>.test.ts`
3. Write test cases for:
   - Happy path (valid input → expected response + status code)
   - Each validation rule (missing fields, invalid enums, future dates, max lengths)
   - Not found (404 for non-existent IDs)
   - Business rules (auto-status updates, rejection reason required, soft-delete exclusion)
4. Run the tests — confirm they all FAIL

## Phase 2: Green (Implement)

5. Create/update the function implementation at `api/functions/<functionName>/index.ts`
6. Follow conventions from docs/project/CLAUDE.md: `{ data, error }` response shape, singleton Cosmos client, TypeScript
7. Run tests after each meaningful change
8. Iterate until ALL tests pass

## Phase 3: Review

9. Re-read the docs/project/CLAUDE.md contract and verify the implementation matches every detail
10. Check for: missing validation, incorrect status codes, response shape mismatches
11. If issues found, fix and re-run tests
