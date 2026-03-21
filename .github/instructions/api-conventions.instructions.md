---
description: "Use when writing or modifying Azure Functions API code. Covers response shapes, Cosmos patterns, validation, and error handling conventions for this project."
applyTo: "api/**/*.ts"
---

# API Conventions

## Response Shape (all endpoints)

```typescript
// Success
{ data: T, error: null }
// Error
{ data: null, error: { code: string, message: string, details?: Array<{ field: string, message: string }> } }
```

## Cosmos DB

- Use singleton client from `api/shared/cosmosClient.ts`
- Partition key is `/id` — always use point reads when fetching by ID
- All list queries must filter `isDeleted = false` (except GET /api/applications/deleted)

## Status Codes

- 200: GET, PATCH, DELETE success
- 201: POST success
- 400: Validation failure
- 404: Not found or soft-deleted
- 413: File > 10 MB
- 415: Invalid file type / content mismatch
- 500: Unexpected error
- 502: Gateway error

## Validation

- Validate at the API boundary (request input)
- Return 400 with `VALIDATION_ERROR` code and `details` array listing each field error
- Use enums from CLAUDE.md for status, rejection reason, interview type, outcome, workMode

## Environment Variables

- Prefix: `COSMOS_`, `STORAGE_`, `EVENTGRID_`
- Never hardcode connection strings or keys
