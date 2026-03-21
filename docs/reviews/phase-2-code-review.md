# Phase 2 Code Review — Backend API

**Date:** 2026-03-21
**Scope:** All 16 Azure Functions endpoints + processUpload Event Grid trigger, shared utilities, 230+ tests
**Rating:** 8.5/10 (post-fix)

---

## Review 1 — Critical & High Issues (Fixed)

### C-1: Mass Assignment Vulnerability in updateApplication (CRITICAL)

**File:** `api/src/functions/updateApplication/index.ts`
**Issue:** `body` object was spread directly into the Cosmos document: `{ ...resource, ...body }`. An attacker could inject `isDeleted`, `createdAt`, `id`, or any internal field.
**Fix:** Added `UPDATABLE_FIELDS` whitelist — only allowed fields are extracted from the request body before merging.

### H-1: Missing Content-Type on Auth Error Responses (HIGH)

**File:** `api/src/shared/auth.ts`
**Issue:** `requireOwner()` returned 401/403 responses without `Content-Type: application/json`, causing clients to misparse the JSON body.
**Fix:** Added `headers: { "Content-Type": "application/json" }` to both 401 and 403 responses.

### H-2: Invalid JSON Body Returns 500 Instead of 400 (HIGH)

**Files:** 6 endpoints that parse `req.json()` — createApplication, updateApplication, addInterview, updateInterview, reorderInterviews, uploadSasToken
**Issue:** `await req.json()` throws on malformed JSON, causing an unhandled exception caught by the outer `catch` block, returning 500.
**Fix:** Wrapped `req.json()` in a try-catch that returns `400 INVALID_BODY "Request body must be valid JSON"`.

### H-3: Missing STORAGE_ACCOUNT_KEY in local.settings.json (HIGH)

**File:** `api/local.settings.json`
**Issue:** `STORAGE_ACCOUNT_KEY` was not listed, so local development with Blob Storage (SAS token endpoints, processUpload) would fail silently.
**Fix:** Added `STORAGE_ACCOUNT_KEY` placeholder to `local.settings.json`.

### H-4: SAS Token Content-Length Constraint Gap Not Documented (HIGH)

**File:** `CLAUDE.md`
**Issue:** Azure Block Blob SAS tokens cannot enforce `Content-Length` server-side. The only enforcement was client-side (trivially bypassed). This gap was not documented.
**Fix:** Documented the constraint in CLAUDE.md and added a note that `processUpload` checks blob size as the server-side enforcement layer. Updated decision log.

### H-5: processUpload Uses Web Streams API Instead of Node.js Streams (HIGH)

**File:** `api/src/functions/processUpload/index.ts`
**Issue:** `readBlobHeader()` used `ReadableStream.getReader()` (Web API), but Azure SDK in Node.js returns `NodeJS.ReadableStream`. Would fail at runtime.
**Fix:** Rewrote to use `for await (const chunk of stream)` pattern with `Buffer.concat()`.

---

## Review 2 — Medium & Low Issues (Fixed)

### M-1: createApplication Allows Custom Initial Status (MEDIUM)

**File:** `api/src/functions/createApplication/index.ts`
**Issue:** Status was set as `body.status ?? "Applying"`, allowing callers to create applications with any status (e.g. "Accepted"). Per R1, initial status must always be "Applying".
**Fix:** Hardcoded `status: "Applying"` — ignores any status in the request body.
**Tests updated:** Changed "should use status provided" test to "should force status to Applying regardless of provided status". Changed "should allow status Rejected" test to verify status is forced to "Applying" while rejection data is still stored.

### M-2: updateApplication Status→Rejected Race Condition (MEDIUM)

**File:** `api/src/functions/updateApplication/index.ts`
**Issue:** Pre-validation checked `body.status === "Rejected"` and required `rejection.reason` in the body. But a concurrent PATCH could set status to Rejected while another sets rejection.reason, leaving the merged document in status "Rejected" with no rejection.reason.
**Fix:** Added a post-merge invariant check: after merging body into the existing document, verify that if `merged.status === "Rejected"` then `merged.rejection?.reason` exists. Returns 400 if violated. Pre-validation carry-forward logic retained for backwards compatibility.

### M-3: Unsafe-Looking SQL Interpolation in listApplications (MEDIUM)

**File:** `api/src/functions/listApplications/index.ts`
**Issue:** `ORDER BY c.${sortBy} ${sortOrder.toUpperCase()}` looks like SQL injection, even though `sortBy` is validated against `VALID_SORT_FIELDS` and `sortOrder` is constrained to `asc`/`desc`.
**Fix:** Added a safety comment documenting why the interpolation is safe (whitelist-validated values).

### M-4: Nested Object Injection in create/updateApplication (MEDIUM)

**File:** `api/src/functions/createApplication/index.ts`, `api/src/functions/updateApplication/index.ts`
**Issue:** `location` and `rejection` objects from the body were used as-is, allowing extra fields (e.g. `location.isAdmin = true`) to be written to Cosmos.
**Fix:** Created `sanitizeLocation()` and `sanitizeRejection()` helper functions that whitelist only known fields (`city`, `country`, `workMode`, `other` for location; `reason`, `notes` for rejection). Applied in both create and update handlers.

### L-1: Duplicated stripBlobUrl Across 7 Files (LOW)

**Files:** getApplication, restoreApplication, addInterview, updateInterview, deleteInterview, reorderInterviews, updateApplication
**Issue:** Each file had its own copy of the `stripBlobUrl()` function (removes `blobUrl` from file metadata before returning in API responses).
**Fix:** Extracted to `api/src/shared/response.ts` as a shared export. All 7 files now import from the shared module.

### L-2: Duplicated FILE_TYPE_TO_FIELD Across 4 Files (LOW)

**Files:** downloadSasToken, deleteFile, processUpload, uploadSasToken
**Issue:** The `FILE_TYPE_TO_FIELD` mapping (`resume` → `"resume"`, `coverLetter` → `"coverLetter"`, `jobDescription` → `"jobDescriptionFile"`) was duplicated in each file.
**Fix:** Extracted to `api/src/shared/types.ts`. All files import from the shared module. processUpload retains its own `CONTAINER_TO_FILE_TYPE` (reverse mapping, not shared).

### L-3: Duplicated VALID_FILE_TYPES Set Across 3 Files (LOW)

**Files:** downloadSasToken, deleteFile, uploadSasToken
**Issue:** Each file created its own `Set` of valid file types.
**Fix:** Added `VALID_FILE_TYPES_SET` to `api/src/shared/types.ts` and `FILE_TYPE_CONTAINERS` mapping. All files import from shared.

### L-4: Duplicated BlobServiceClient Construction in 4 Files (LOW)

**Files:** uploadSasToken, downloadSasToken, deleteFile, processUpload
**Issue:** Each file independently created `StorageSharedKeyCredential` and `BlobServiceClient` from env vars, without validation or singleton reuse.
**Fix:** Created `api/src/shared/storageClient.ts` with singleton `getBlobServiceClient()`, `getStorageCredential()`, and `getStorageAccountName()` — mirrors the existing `cosmosClient.ts` pattern. Validates env vars on first use. All 4 files updated to use the shared client.

### L-5: No Env Var Validation for Storage Credentials (LOW)

**Files:** uploadSasToken, downloadSasToken, deleteFile, processUpload
**Issue:** `process.env.STORAGE_ACCOUNT_NAME!` and `process.env.STORAGE_ACCOUNT_KEY!` used non-null assertions. Missing env vars would cause cryptic runtime errors.
**Fix:** `storageClient.ts` throws a clear error message if either env var is missing.

### L-6: Duplicated Reorder Validation Logic (LOW)

**File:** `api/src/functions/reorderInterviews/index.ts`
**Issue:** Interview ID validation logic (check all IDs exist, check for missing/extra IDs) was inline in the handler — same logic already existed in `api/src/shared/validation.ts` as `validateReorderRequest()`.
**Fix:** Handler now imports and uses the shared `validateReorderRequest()` after reading interviews from Cosmos.

---

## Additional Improvements (Review 1)

### Tests Added

- Invalid JSON body handling tests for all 6 parsing endpoints
- Mass assignment prevention test for updateApplication
- Rejection clearing edge case test for updateApplication

### Dependencies Cleaned

- Removed unused `@azure/data-tables`, `uuid`, `@types/uuid` from `package.json`

### Documentation Updated

- `SOLUTION.md` auth model updated to reflect Function-level enforcement (not SWA gateway)
- `CLAUDE.md` Phase 2 marked complete, decisions log updated

---

## New Files Created

| File                              | Purpose                                             |
| --------------------------------- | --------------------------------------------------- |
| `api/src/shared/storageClient.ts` | Singleton BlobServiceClient with env var validation |

## Files Modified (Summary)

| File                                                            | Changes                                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `api/src/shared/types.ts`                                       | Added `FILE_TYPE_TO_FIELD`, `FILE_TYPE_CONTAINERS`, `VALID_FILE_TYPES_SET` exports |
| `api/src/shared/response.ts`                                    | Added shared `stripBlobUrl()` function                                             |
| `api/src/shared/auth.ts`                                        | Added Content-Type header to 401/403 responses                                     |
| `api/src/functions/createApplication/index.ts`                  | Forced "Applying" status, sanitize location/rejection                              |
| `api/src/functions/createApplication/createApplication.test.ts` | Updated tests for forced status                                                    |
| `api/src/functions/updateApplication/index.ts`                  | Post-merge rejection check, sanitize nested objects, shared stripBlobUrl           |
| `api/src/functions/getApplication/index.ts`                     | Use shared stripBlobUrl                                                            |
| `api/src/functions/restoreApplication/index.ts`                 | Use shared stripBlobUrl                                                            |
| `api/src/functions/addInterview/index.ts`                       | Use shared stripBlobUrl                                                            |
| `api/src/functions/updateInterview/index.ts`                    | Use shared stripBlobUrl                                                            |
| `api/src/functions/deleteInterview/index.ts`                    | Use shared stripBlobUrl                                                            |
| `api/src/functions/reorderInterviews/index.ts`                  | Use shared stripBlobUrl + validateReorderRequest                                   |
| `api/src/functions/listApplications/index.ts`                   | Safety comment on ORDER BY                                                         |
| `api/src/functions/uploadSasToken/index.ts`                     | Use shared storageClient + types                                                   |
| `api/src/functions/downloadSasToken/index.ts`                   | Use shared storageClient + types                                                   |
| `api/src/functions/deleteFile/index.ts`                         | Use shared storageClient + types                                                   |
| `api/src/functions/processUpload/index.ts`                      | Use shared storageClient + types, removed duplicated constants/helpers             |
