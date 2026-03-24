# Phase 6 — Security Review

**Date:** 2026-03-24
**Reviewer:** Claude Code (automated audit)
**Scope:** Auth enforcement, SAS token security, CORS configuration, input validation (processUpload)

---

## A1. Auth Coverage — All 16 Functions

Every HTTP-exposed Function calls `requireOwner(request)` as its first operation and returns early on 401/403.

| Function | Trigger | Has requireOwner | Auth first | Early return |
|----------|---------|-----------------|------------|-------------|
| createApplication | HTTP POST | Yes | Yes | Yes |
| getApplication | HTTP GET | Yes | Yes | Yes |
| listApplications | HTTP GET | Yes | Yes | Yes |
| updateApplication | HTTP PATCH | Yes | Yes | Yes |
| deleteApplication | HTTP DELETE | Yes | Yes | Yes |
| restoreApplication | HTTP PATCH | Yes | Yes | Yes |
| listDeleted | HTTP GET | Yes | Yes | Yes |
| getStats | HTTP GET | Yes | Yes | Yes |
| addInterview | HTTP POST | Yes | Yes | Yes |
| updateInterview | HTTP PATCH | Yes | Yes | Yes |
| deleteInterview | HTTP DELETE | Yes | Yes | Yes |
| reorderInterviews | HTTP PATCH | Yes | Yes | Yes |
| uploadSasToken | HTTP POST | Yes | Yes | Yes |
| downloadSasToken | HTTP GET | Yes | Yes | Yes |
| deleteFile | HTTP DELETE | Yes | Yes | Yes |
| processUpload | Event Grid | N/A | N/A | N/A |

**processUpload** is registered via `app.eventGrid()` with no HTTP route. It cannot be invoked by a browser or API client. It validates application ownership implicitly by checking existence and soft-delete status in Cosmos.

**Result: PASS** — no auth gaps found.

---

## A2. SAS Token Verification

### Upload Token (`uploadSasToken`)

| Property | Expected | Actual | Status |
|----------|----------|--------|--------|
| Permissions | Create + Write only | `BlobSASPermissions.parse("cw")` | Pass |
| Expiry | 5 minutes | `Date.now() + 5 * 60 * 1000` | Pass |
| Scope | Single blob | Generated via `blockBlobClient.generateSasUrl()` | Pass |
| Credential | StorageSharedKeyCredential | Via shared `storageClient.ts` | Pass |

**Validation before token issuance:**

- `applicationId` required, must exist in Cosmos and not be soft-deleted
- `fileType` must be `resume`, `coverLetter`, or `jobDescription`
- `fileName` extension validated per fileType (`.pdf`, `.docx`, `.html` for JD only)
- `contentType` must match file extension

### Download Token (`downloadSasToken`)

| Property | Expected | Actual | Status |
|----------|----------|--------|--------|
| Permissions | Read only | `BlobSASPermissions.parse("r")` | Pass |
| Expiry | 5 minutes | `Date.now() + 5 * 60 * 1000` | Pass |
| Scope | Single blob | Generated via `blockBlobClient.generateSasUrl()` | Pass |
| Credential | StorageSharedKeyCredential | Via shared `storageClient.ts` | Pass |

**Validation before token issuance:**

- `applicationId` required, must exist in Cosmos and not be soft-deleted
- `fileType` validated against enum
- File metadata must exist on the application (404 if no file uploaded)

**Result: PASS** — both tokens are short-lived, single-blob scoped, and minimally permissioned.

---

## A3. CORS Verification (Deployed vs Bicep)

### Blob Storage CORS

| Property | Bicep definition | Deployed | Match |
|----------|-----------------|----------|-------|
| Allowed origins | `https://${staticWebApp.properties.defaultHostname}` | `https://gray-rock-0c358e300.1.azurestaticapps.net` | Yes |
| Allowed methods | PUT, GET, HEAD | PUT, GET, HEAD | Yes |
| Allowed headers | `*` | `*` | Yes |
| Exposed headers | Content-Type, x-ms-blob-type | Content-Type, x-ms-blob-type | Yes |
| Max age | 3600 | 3600 | Yes |

### Function App CORS

| Property | Deployed |
|----------|----------|
| Allowed origins | `https://gray-rock-0c358e300.1.azurestaticapps.net` |
| Support credentials | true |

No wildcard origins. Only the SWA production hostname is allowed.

**Result: PASS** — deployed CORS matches Bicep exactly. No wildcards or overly permissive origins.

---

## A4. processUpload Input Validation

| Check | Implemented | Behaviour on failure |
|-------|------------|---------------------|
| Blob size > 10 MB | Yes — `properties.contentLength > MAX_FILE_SIZE` | Blob deleted, processing skipped |
| Magic bytes (PDF: `%PDF`, DOCX: `PK`, HTML: `<!doctype`/`<html`) | Yes — reads first 16 bytes via range download | Blob deleted, processing skipped |
| Soft-deleted application | Yes — `resource.isDeleted` check | Processing skipped silently |
| Application not found | Yes — `!resource` check | Processing skipped silently |
| "Latest wins" timestamp | Yes — compares blob timestamp against existing `uploadedAt` | Older upload skipped |
| Blob already deleted (retry) | Yes — `getProperties()` 404 caught | Returns gracefully |
| Invalid container | Yes — `VALID_CONTAINERS` whitelist | Processing skipped |
| Old blob deletion failure | Yes — `deleteIfExists()` in try/catch | Logged as non-fatal warning |

**Result: PASS** — processUpload has defence in depth across all validation layers.

---

## Summary

| Area | Result | Issues Found |
|------|--------|-------------|
| Auth coverage (15 HTTP functions) | **PASS** | 0 |
| processUpload isolation (Event Grid only) | **PASS** | 0 |
| Upload SAS token security | **PASS** | 0 |
| Download SAS token security | **PASS** | 0 |
| Blob Storage CORS | **PASS** | 0 |
| Function App CORS | **PASS** | 0 |
| processUpload input validation | **PASS** | 0 |

**Overall: No security issues found.** All functions enforce auth correctly, SAS tokens are properly scoped, CORS is locked to the SWA origin, and processUpload validates all inputs with defence in depth.
