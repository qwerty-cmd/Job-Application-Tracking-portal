# Job Application Tracking Portal

## Architecture

```
Frontend:  React + TypeScript (Vite)
Backend:   Azure Functions (Node.js/TypeScript, Consumption plan)
Database:  Azure Cosmos DB (NoSQL API, free tier — 1000 RU/s, 25 GB)
Storage:   Azure Blob Storage (resumes, cover letters, job descriptions)
Events:    Azure Event Grid (blob upload → function trigger)
Hosting:   Azure Static Web Apps (free tier)
IaC:       Bicep
CI/CD:     GitHub Actions (auto via Azure SWA)
Auth:      Azure SWA built-in (GitHub provider)
```

## Current Status

- [x] Phase 0: Architecture & Design — **complete**
- [x] Phase 1: Infrastructure (Bicep) — **complete (deployed to Azure, all 16 resources live)**
- [x] Phase 2: Backend API (CRUD Functions) — **complete (all 16 endpoints + processUpload trigger, 266 tests)**
- [x] Phase 3: Event Streaming Pipeline — **complete (deployed, E2E verified, dead-letter configured)**
- [x] Phase 4: Frontend (React) — **complete (dashboard, interview pipeline/dropoff analytics, accessibility/test fixes)**
- [ ] Phase 5: CI/CD & Deployment
- [ ] Phase 6: Polish & Showcase-Ready

**Currently working on:** Phase 5 — CI/CD & Deployment.

## Design Steps Tracker

| Step | Topic                       | Status     |
| ---- | --------------------------- | ---------- |
| 1    | User Flow & Requirements    | ✅ Done    |
| 2    | Data Model (Cosmos DB)      | ✅ Done    |
| 3    | API Contract                | ✅ Done    |
| 4    | File Upload Architecture    | ✅ Done    |
| 5    | Event-Driven Pipeline       | ✅ Done    |
| 6    | Authentication & Security   | ✅ Done    |
| 7    | Infrastructure & Deployment | ✅ Planned |

## Decisions Made

- Partition key: `/id`
- Blob path structure: `{containerName}/{applicationId}/{timestamp}-{filename}` (timestamped to prevent collisions)
- Blob containers: `resumes`, `coverletters`, `jobdescriptions`
- SAS token expiry: 5 minutes
- SAS token scope: single blob, create+write only (no read/delete)
- Auth: Azure SWA built-in GitHub provider (restrict to personal account)
- App access model: private app; all frontend routes require a custom `owner` role (not just `authenticated`); API access enforced at the Function level
- Authorization roles: SWA built-in roles (`anonymous`, `authenticated`) plus custom `owner`; only the personal GitHub account is assigned `owner`
- SWA linked backend not used — SWA Free tier does not support linking external Function Apps; frontend calls Function App URL directly
- AuthN/AuthZ enforcement point: Azure Functions enforce authorization by reading and validating the `x-ms-client-principal` header on every request; SWA Free tier cannot enforce `/api/*` route rules against an external Function App
- API identity mechanism: SWA-managed auth session and client principal (`x-ms-client-principal`) for API context; Functions validate this header and check for `owner` role; no custom JWT issuance/validation flow in v1
- API keys are not used for browser-to-API authentication in this app
- Rate limiting strategy (v1): no API Management; rely on private owner-only access plus targeted in-function defensive throttling for sensitive endpoints (especially SAS token issuance/download)
- Cosmos DB client: singleton pattern in `api/shared/cosmosClient.ts`
- File uploads: direct browser → Blob via SAS token (never proxy through Functions)
- Soft delete (isDeleted flag + deletedAt timestamp, with undelete endpoint)
- Embed interviews inside application document (not separate documents)
- Interview rounds are reorderable (numeric `order` field)
- Adding first interview auto-updates status to "Interview Stage"
- File download uses a separate endpoint from upload SAS token
- File re-upload overwrites the previous file — `processUpload` Function deletes the old blob (using storage connection string) then updates Cosmos with new file metadata; Blob Storage lifecycle policy (90-day last-modified TTL) acts as safety net for any blobs that escape deletion
- Blob paths include a timestamp: `{container}/{applicationId}/{timestamp}-{filename}` — each upload gets a unique path, preventing overwrite collisions and enabling "latest wins" logic in processUpload
- Race condition safety: when multiple uploads of the same fileType race, processUpload compares the blob's timestamp against the existing Cosmos record's `uploadedAt` — only processes if newer ("latest wins"); older events are discarded and their blobs are cleaned up by lifecycle policy
- CORS on Blob Storage: allow `PUT`, `GET`, `HEAD` from SWA origin (`https://*.azurestaticapps.net`); exposed headers: `Content-Type`, `x-ms-blob-type`; configured in Bicep on the storage account
- Browser blob PUT requires headers: `x-ms-blob-type: BlockBlob` and `Content-Type` matching the file MIME type
- Client-side validation runs before SAS token request: check file extension and size (max 10 MB); show inline error if invalid — avoids burning a token on a bad file
- SAS token issuance validates: `applicationId` exists in Cosmos (404 if not), `fileType` is valid enum, `fileName` ends in allowed extension
- `processUpload` derives `fileType` from container name in blob path: `resumes` → `resume`, `coverletters` → `coverLetter`, `jobdescriptions` → `jobDescription`
- `processUpload` skips processing if the application is soft-deleted (`isDeleted: true`) — orphaned blob is cleaned up by the 90-day lifecycle policy
- `processUpload` validates file content via magic bytes before updating Cosmos: PDF must start with `%PDF`, DOCX must start with `PK` (ZIP signature), HTML must start with `<!DOCTYPE` or `<html` (case-insensitive); if validation fails, the blob is deleted and Cosmos is not updated
- `processUpload` must be idempotent — Event Grid may deliver the same event multiple times (retry on failure); "blob not found" on old blob deletion is treated as success, not an error
- Event Grid retry behaviour: if processUpload fails, Event Grid retries with exponential backoff for up to 24 hours; processUpload must handle duplicate deliveries gracefully
- Event pipeline uses Azure Event Grid system topic from Blob Storage (not custom topic)
- Event pipeline uses a single Event Grid subscription for uploads; Event Grid filters to `Microsoft.Storage.BlobCreated`, and `processUpload` accepts only `resumes`, `coverletters`, and `jobdescriptions`
- Event Grid event schema: Event Grid Schema (not CloudEvents 1.0) — simpler for an Azure-only project and aligns better with Azure-native docs/examples
- Event destination: Azure Function Event Grid trigger binding for `processUpload` (not manual HTTP webhook validation)
- Dead-lettering enabled on the Event Grid subscription, writing undelivered events to a dedicated Blob Storage container for inspection/replay
- Event Grid retry policy uses the service defaults: up to 30 delivery attempts and 24-hour TTL; undeliverable events are dead-lettered after retry exhaustion
- IaC deployment topology: Azure Static Web Apps (no linked backend) + separate Azure Functions app (Consumption) + Cosmos DB + Storage + Event Grid system topic/subscription, all provisioned via Bicep
- Bicep structure: `infra/main.bicep` as entrypoint with modular resources and `infra/parameters.json` for environment-specific values
- Storage containers managed by IaC: `resumes`, `coverletters`, `jobdescriptions`, and `deadletter`
- Event Grid subscription configuration in IaC includes BlobCreated-only filtering and dead-letter destination wiring
- Infrastructure outputs must expose key deployment values (SWA hostname, Function app name, Cosmos endpoint, Storage account name) for post-deploy configuration/validation
- Step 7 scope is planning-only: no Phase 1 resource implementation starts until planning docs are reviewed and approved
- Upload completion detection: frontend records `Date.now()` before the PUT, then polls `GET /:id` every 2 seconds (max 15 seconds) until the file field's `uploadedAt` is newer than the recorded timestamp; handles both first upload (field was null) and re-upload (field had old timestamp); shows "processing" state if timeout reached
- Upload failure handling: if PUT fails, frontend discards the SAS token and shows an error — user retries from scratch (requests a new token); no partial recovery needed (blob PUT is atomic under 256 MB)
- Upload progress: v1 shows a progress bar using `XMLHttpRequest` with `upload.onprogress`
- Concurrent uploads: allowed — resume and cover letter can be uploaded simultaneously; each has its own SAS token and independent blob path
- Location: structured (city, country, workMode) + Other free text
- Date applied defaults to today
- Job description capture: URL + paste text + file upload (all optional)
- Allowed file types: PDF, DOCX for resume/cover letter; PDF, DOCX, HTML for job description
- Max file size: 10 MB per file
- Dashboard: count per status stage, configurable time period (default monthly)
- Interview reflections field included in v1 (AI placeholder for v2)
- API responses use consistent `{ data, error }` shape
- PATCH for partial updates (not PUT)
- Frontend component library: Shadcn/ui + Tailwind CSS (copy-paste components, Radix UI primitives, TanStack Table for data table, react-hook-form + zod for forms, @dnd-kit/core for drag-and-drop)
- Frontend testing: Vitest + React Testing Library + MSW (Mock Service Worker) — same test runner as backend, RTL tests user behaviour not implementation, MSW intercepts fetch at network level
- Applications list page: Excel-style table view (not cards) for quick overview — sortable columns, pagination, file status indicators

## Design Rationale

### Step 1 — Why These Requirements?

- **Structured location over free text:** Enables filtering/grouping by work mode (Remote/Hybrid/Onsite) in the dashboard. Free text "Other" field catches edge cases.
- **Date applied defaults to today:** Most common use case is logging an application the same day you submit. Reduces friction.
- **Job posting URL + text paste + file upload (all three):** JD postings get taken offline. URL is convenient when live, pasting captures content quickly, HTML file upload preserves formatting. User can use any combination.
- **"Applying" vs "Application Submitted" as separate statuses:** "Applying" = still preparing (drafting cover letter, customizing resume). "Submitted" = actually sent. Useful for tracking preparation time.
- **"Withdrawn" status:** You may pull out of a process yourself — this is different from being rejected.
- **Rejection reason as dropdown + free text:** Dropdown enables analytics ("how many times was I ghosted?"). Free text captures specifics. "Other" dropdown option allows free text entry for unlisted reasons.
- **Interview reflections in v1 (without AI):** Capturing the data now means it's ready for AI analysis in v2 without backfilling.
- **Count per status stage (not success/rejection rate):** "Success rate" is ambiguous (is getting an interview a success?). Raw counts per stage are more useful and unambiguous.

### Step 2 — Why This Data Model?

- **Embed interviews inside application (not separate documents):** Interviews are always viewed in the context of an application — never independently. A single application will have at most ~10 rounds, keeping document size well under Cosmos DB's 2 MB limit. Embedding means one read (1 RU) gets everything.
- **Partition key `/id` (not `/company`):** High cardinality (every application has a unique ID), no hot partitions, cheapest possible point reads (1 RU). `/company` was considered but rejected — multiple applications to the same company would cluster in one partition, and you rarely query "all applications for company X."
- **Soft delete over hard delete:** Enables undo. `isDeleted: true` + `deletedAt` timestamp hides the record from queries but preserves data. Undelete endpoint can restore it.
- **`order` field on interviews:** Allows drag-to-reorder in the UI. Separate from `round` number (which is the logical sequence). `order` controls display position.
- **Files stored in Blob Storage, only metadata in Cosmos:** Binary files would bloat documents and consume RUs. Cosmos stores just `blobUrl`, `fileName`, `uploadedAt` references.
- **`blobUrl` in Cosmos but NOT returned in API GET responses:** Blob URLs with SAS tokens are generated on-demand via the download endpoint. Prevents stale/expired URLs sitting in responses.

### Step 4 — Why This File Upload Architecture?

- **CORS configured in Bicep (not manually):** Storage account CORS is infrastructure config — it belongs in the Bicep template so it's reproducible. Allowing only the SWA origin (not `*`) limits exposure.
- **`x-ms-blob-type: BlockBlob` required by Azure:** Azure Blob Storage rejects PUTs without this header. Documenting it here so it's not a surprise during implementation.
- **Client-side validation before SAS request:** Catching invalid files on the frontend avoids a round trip to the Function and wastes a 5-minute token. The Function still validates — client-side is UX only, not a security control.
- **`applicationId` validated before issuing SAS token:** Prevents orphaned blobs for non-existent applications. A token issued for a deleted or non-existent application would result in a blob with no Cosmos record to link to.
- **`processUpload` derives fileType from container name:** The BlobCreated event payload includes the blob URL. Parsing the container name is more reliable than embedding fileType in the blob path or filename, and requires no changes to the SAS token flow.
- **Polling over WebSockets/SignalR for upload completion:** Event Grid → Function → Cosmos is async but fast (typically <2 seconds). Polling every 2 seconds for up to 15 seconds is simple, free, and sufficient for v1. SignalR adds a new Azure service and complexity that isn't justified.
- **Polling compares `uploadedAt` timestamps (not just field existence):** On re-upload, the file field is already non-null with old metadata. Checking field existence would immediately succeed and show stale data. Comparing `uploadedAt` against the timestamp recorded before the PUT ensures the frontend waits for the new processUpload to complete.
- **Timestamped blob paths prevent race conditions:** Each upload gets a unique path (`{container}/{applicationId}/{timestamp}-{filename}`). If two uploads of the same fileType race, processUpload uses "latest wins" — compares the blob's timestamp against Cosmos `uploadedAt` and only processes if newer. The older blob is left for the lifecycle policy to clean up.
- **processUpload skips soft-deleted applications:** Between SAS issuance (which validates the app exists) and processUpload execution, the application could be soft-deleted. Processing an upload for a deleted app would create an inconsistency. Skipping it is safe — the orphaned blob is caught by the 90-day lifecycle policy.
- **Event Grid retry + processUpload idempotency:** Event Grid retries failed deliveries with exponential backoff for up to 24 hours. processUpload must be idempotent — treating "blob not found" on old blob deletion as a success (not an error) ensures retries don't fail on already-cleaned-up state.
- **Server-side content validation via magic bytes:** File extension checks alone are trivially bypassed. Since this is a public app, processUpload reads the first few bytes of the blob and validates against known signatures (PDF: `%PDF`, DOCX: `PK`/ZIP, HTML: `<!DOCTYPE`/`<html`). If content doesn't match, the blob is deleted and Cosmos is not updated. This is ~10 lines of code with no new dependencies.
- **processUpload size check as primary server-side enforcement (defence in depth):** Azure Block Blob SAS tokens do not natively support `Content-Length` constraints. Client-side validation is the first gate (extension + size check before SAS request), processUpload checks blob size after upload and deletes oversized blobs as the server-side enforcement. Two layers: client-side validation, then processUpload size check.
- **`XMLHttpRequest` for progress over fetch:** `fetch` doesn't expose upload progress natively in all browsers. `XMLHttpRequest.upload.onprogress` is well-supported and straightforward for a single PUT.
- **Atomic blob PUT means no partial recovery needed:** Files under 256 MB use a single-block PUT — it either succeeds or fails entirely. No multipart cleanup required.

### Step 5 — Why This Event-Driven Pipeline?

- **Azure Event Grid system topic over custom topic:** Blob Storage already emits first-party events. A system topic is the native integration point, avoids extra infrastructure, and matches how Azure expects Storage events to be wired.
- **Single Event Grid subscription over one-per-container:** Cost is effectively the same for this app because billing is driven by event operations, not by whether container filtering is split across multiple subscriptions. One subscription keeps Bicep simpler; `processUpload` already derives the container name and can reject any container outside the three allowed upload containers.
- **Event Grid Schema over CloudEvents 1.0:** Both schemas carry the same blob event data, but this is an Azure-only project. Event Grid Schema is easier to reason about, aligns with Azure-native examples, and avoids introducing portability concepts that don't add practical value here.
- **Event Grid trigger binding over HTTP webhook:** The Functions binding removes manual subscription validation and request parsing. That keeps the handler smaller and lowers the chance of wiring mistakes.
- **Filter to `Microsoft.Storage.BlobCreated` only:** `processUpload` should run only for successful uploads. Excluding delete events prevents noise from lifecycle policy cleanup or manual blob deletion.
- **Dead-letter to Blob Storage:** If retries are exhausted, the event should be inspectable instead of silently disappearing. Blob dead-lettering is cheap, native, and sufficient for a single-user app.
- **Keep default retry policy:** Event Grid's default retry window (24-hour TTL, up to 30 attempts) is already appropriate here. There's no need to tune retry timing for a low-volume personal app unless real failures show a problem.
- **Idempotency is required because retries can happen after partial success:** Even if Cosmos was already updated on a previous attempt, a retry must be safe. The "latest wins" timestamp check plus "blob not found" as a successful delete outcome makes repeated deliveries harmless.

### Step 6 — Why This Authentication & Security Model?

- **Use SWA built-in GitHub provider:** This app is personal and Azure-only. Built-in auth avoids custom identity plumbing and reduces the risk of security mistakes.
- **Private app with `owner` role (not `authenticated`):** `authenticated` allows any signed-in user from enabled providers. Restricting routes to `owner` ensures only the intended personal account can access the frontend. Functions enforce the same check server-side.
- **Function-level auth over SWA gateway enforcement:** SWA Free tier does not support linked backends, so the SWA gateway cannot enforce `/api/*` route rules. Each Function validates the `x-ms-client-principal` header and checks for the `owner` role — the security outcome is identical, with ~10 lines of shared auth helper code. This avoids paying for SWA Standard (~$9/month) for a single-user portfolio app.
- **SWA session/client principal over API keys:** Browser API keys are not secret and are poor for user-level auth. SWA-managed auth context is safer, and the `x-ms-client-principal` header is available to Functions for role validation.
- **No custom JWT flow in v1:** SWA already manages authentication state. Adding custom JWT issuance/verification would duplicate platform features with little benefit for a single-user app.
- **Rate limiting without APIM in v1:** API Management adds unnecessary cost/complexity for a private personal app. Targeted throttling on sensitive endpoints provides practical protection while keeping architecture lean.
- **Defence in depth remains in Functions:** Backend handlers validate payloads, file metadata, auth headers, and business rules — the Function is the primary enforcement boundary given no gateway link.

### Step 7 — Why This Infrastructure & Deployment Plan?

- **Keep all core infrastructure in Bicep:** Infrastructure as code makes provisioning repeatable, reviewable, and less error-prone than portal-first setup.
- **Separate SWA and Functions resources (no linked backend):** SWA handles frontend/auth edge concerns; a dedicated Function app handles API/event workloads. SWA Free tier does not support linked backends, so the Function App is standalone. The `swaLinkedBackend` resource was removed from Bicep — it caused a deployment failure (`SkuCode 'Free' is invalid`).
- **Provision upload and reliability primitives up front:** Blob containers and Event Grid dead-letter storage are part of baseline infrastructure, not afterthoughts.
- **Use parameterized deployments:** `infra/parameters.json` keeps environment values out of templates and allows safe repeat deployments across environments.
- **Define deterministic deployment outputs:** Exposing endpoints/names from IaC reduces manual lookup errors during app configuration and smoke testing.
- **Wire security-relevant settings in infrastructure:** CORS, event filters, and dead-letter routing are deployment concerns and should remain under IaC control.
- **Gate execution after planning review:** Locking Step 7 as planning-only ensures Phase 1 starts from approved design decisions and avoids rework.

### Step 3 — Why This API Design?

- **PATCH over PUT:** PUT requires sending the entire object. PATCH lets you send only what changed — better for updating just the status or adding a rejection reason.
- **Consistent `{ data, error }` response shape:** Frontend never has to guess the shape. Always check `response.error` first.
- **Separate upload and download SAS token endpoints:** Upload tokens need create+write permissions on a new blob path. Download tokens need read permission on an existing blob. Different scoping and validation — cleaner as separate endpoints.
- **List endpoint returns summary, not full document:** No interview details, no JD text, no blob URLs in the list response. Keeps it small and fast. Frontend calls GET /:id when user clicks into a specific application.
- **Auto-update status to "Interview Stage" when first interview added:** Reduces manual status management. If you're adding interviews, you're in the interview stage.
- **SAS token with 5-minute expiry, single-blob scope:** Short-lived = limits window of misuse. Single-blob scope = token can't be used to access other files. Create+write only = can't read or delete other blobs.
- **Pagination with max 100 per page:** Prevents accidentally dumping hundreds of records in one response. 20 is default, 100 is the ceiling.
- **Separate `GET /api/applications/deleted` endpoint (not a query param):** The main list always excludes deleted records — no risk of accidentally surfacing them. The deleted endpoint is an explicit, separate screen (undo/recently deleted view). Restore is already handled by `PATCH /:id/restore`.
- **`DELETE /api/applications/:id/files/:fileType` for individual file removal:** Reads the current `blobUrl` for that `fileType` from Cosmos, deletes the blob from storage, then nulls out that field in the Cosmos record. Allows removing a file without deleting the whole application.
- **Stats always exclude soft-deleted applications:** Deleted apps are logically gone from the user's perspective. Including them in counts would pollute the dashboard with data the user has chosen to discard.
- **401/403 enforced by Functions via `x-ms-client-principal` header:** SWA Free tier cannot enforce API route rules without a linked backend. Each Function reads the `x-ms-client-principal` header, decodes it, and checks for the `owner` role. 401 = header absent or no valid session, 403 = authenticated but missing `owner` role. A shared `requireOwner(req)` helper in `api/shared/auth.ts` handles this for all Functions.
- **File re-upload overwrites via processUpload + lifecycle policy safety net:** Client SAS tokens are create+write only — deletion is never in the client's hands. `processUpload` handles old blob deletion using its storage connection string (full access). Cosmos is updated before the delete so the record stays consistent if the delete fails. A 90-day lifecycle policy on the storage account catches any blobs that escape deletion. Lifecycle management is free; the delete transactions it triggers are negligible cost for a single-user app.

## v1 Requirements (Baseline)

### R1: Create Job Application

- Company name (required)
- Role / job title (required)
- Location: city, country, work mode (Remote/Hybrid/Onsite), Other free text
- Date applied (required, defaults to today)
- Job posting URL (optional)
- Job description text (optional, paste JD content)
- Job description file (optional, upload HTML/PDF/DOCX)
- Resume (optional, upload PDF/DOCX)
- Cover letter (optional, upload PDF/DOCX)
- Initial status: "Applying"

### R2: Update Application Status

Statuses: `Applying → Application Submitted → Recruiter Screening → Interview Stage → Pending Offer → Accepted | Rejected | Withdrawn`

### R3: Rejection / Failure Reason

- Dropdown: Ghosted, Failed Technical, Failed Behavioral, Overqualified, Underqualified, Salary Mismatch, Position Filled, Company Freeze, Other
- Free text notes field
- "Other" dropdown option allows free text entry
- Required when status is set to Rejected

### R4: Dashboard / Analytics

- Count of applications per status stage
- Count of interviews by type
- Configurable time period (default: current month)

### R5: File Upload & Download

- Upload PDF/DOCX (resume, cover letter) or PDF/DOCX/HTML (job description)
- Max 10 MB per file
- Download previously uploaded files

### R6: Interview Rounds (nested per application)

- Round number + reorderable via `order` field
- Type: Phone Screen, Technical, Behavioral, Case Study, Panel, Take Home Test, Other
- Date, Interviewer(s) (free text), Notes, Reflection (AI placeholder for v2)
- Outcome per round: Passed, Failed, Pending, Cancelled

## v2 Requirements (Future — AI Integration)

### R7: AI Diagnosis of Failure

- Analyze rejection patterns, resume fit, etc.

### R8: Interview AI Feedback

- AI rates interview reflections, gives improvement feedback

## Data Model (Cosmos DB)

**Database:** `jobtracker` | **Container:** `applications` | **Partition Key:** `/id` | **Soft delete:** `isDeleted` + `deletedAt`

```json
{
  "id": "uuid",
  "company": "string",
  "role": "string",
  "location": {
    "city": "string",
    "country": "string",
    "workMode": "Remote | Hybrid | Onsite",
    "other": "string | null"
  },
  "dateApplied": "YYYY-MM-DD",
  "jobPostingUrl": "string | null",
  "jobDescriptionText": "string | null",
  "jobDescriptionFile": {
    "blobUrl": "string",
    "fileName": "string",
    "uploadedAt": "ISO 8601"
  },
  "status": "Applying | Application Submitted | Recruiter Screening | Interview Stage | Pending Offer | Accepted | Rejected | Withdrawn",
  "resume": {
    "blobUrl": "string",
    "fileName": "string",
    "uploadedAt": "ISO 8601"
  },
  "coverLetter": {
    "blobUrl": "string",
    "fileName": "string",
    "uploadedAt": "ISO 8601"
  },
  "rejection": {
    "reason": "Ghosted | Failed Technical | Failed Behavioral | Overqualified | Underqualified | Salary Mismatch | Position Filled | Company Freeze | Other",
    "notes": "string"
  },
  "interviews": [
    {
      "id": "uuid",
      "round": 1,
      "type": "Phone Screen | Technical | Behavioral | Case Study | Panel | Take Home Test | Other",
      "date": "YYYY-MM-DD",
      "interviewers": "string",
      "notes": "string",
      "reflection": "string",
      "outcome": "Passed | Failed | Pending | Cancelled",
      "order": 1
    }
  ],
  "isDeleted": false,
  "deletedAt": "ISO 8601 | null",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

## API Endpoints

| Method | Route                                         | Description                                            |
| ------ | --------------------------------------------- | ------------------------------------------------------ |
| GET    | /api/applications                             | List all applications (with filters, sort, pagination) |
| GET    | /api/applications/:id                         | Get single application (full detail)                   |
| POST   | /api/applications                             | Create new application                                 |
| PATCH  | /api/applications/:id                         | Update application fields (partial)                    |
| DELETE | /api/applications/:id                         | Soft delete application                                |
| PATCH  | /api/applications/:id/restore                 | Undelete (restore soft-deleted application)            |
| POST   | /api/applications/:id/interviews              | Add interview round                                    |
| PATCH  | /api/applications/:id/interviews/:interviewId | Update interview round                                 |
| DELETE | /api/applications/:id/interviews/:interviewId | Remove interview round                                 |
| PATCH  | /api/applications/:id/interviews/reorder      | Reorder interview rounds                               |
| POST   | /api/upload/sas-token                         | Get SAS token for file upload                          |
| GET    | /api/download/sas-token                       | Get SAS token for file download                        |
| GET    | /api/applications/stats                       | Dashboard statistics                                   |
| GET    | /api/applications/deleted                     | List soft-deleted applications (for restore/undo UI)   |
| DELETE | /api/applications/:id/files/:fileType         | Delete a single uploaded file from an application      |

### HTTP Status Codes Used

| Code | Meaning                | When Used                                                                                            |
| ---- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| 200  | OK                     | Successful GET, PATCH, DELETE                                                                        |
| 201  | Created                | Successful POST                                                                                      |
| 400  | Bad Request            | Validation failed (missing fields, invalid enum)                                                     |
| 401  | Unauthorized           | No valid session — `x-ms-client-principal` header absent or invalid, returned by Function auth guard |
| 403  | Forbidden              | Authenticated but missing `owner` role — returned by Function auth guard                             |
| 404  | Not Found              | Application/interview ID doesn't exist or is soft-deleted                                            |
| 413  | Payload Too Large      | File exceeds 10 MB                                                                                   |
| 415  | Unsupported Media Type | File type not PDF/DOCX/HTML                                                                          |
| 500  | Internal Server Error  | Unexpected failure                                                                                   |

### API Response Shape (all endpoints)

```json
// Success
{ "data": { ... }, "error": null }

// Error
{ "data": null, "error": { "code": "ERROR_CODE", "message": "...", "details": [...] } }
```

### API Query Parameters (GET /api/applications)

- `status` — filter by status
- `from` / `to` — filter by date applied range
- `sortBy` — dateApplied, company, status, updatedAt (default: dateApplied)
- `sortOrder` — asc, desc (default: desc)
- `page` / `pageSize` — pagination (default: page 1, pageSize 20, max 100)
- Free-text search (by company/role) is deferred to v2

### API Validation Rules

- `company` and `role` required, max 200 chars
- `dateApplied` required, valid YYYY-MM-DD, not in future
- `status` must be valid enum value
- `rejection.reason` required when status is Rejected
- `jobPostingUrl` must be valid URL if provided
- `jobDescriptionText` max 50,000 chars
- `location.workMode` must be one of: Remote, Hybrid, Onsite (if provided)
- Interview `type` required, must be valid enum
- Interview `date` required, valid YYYY-MM-DD (future dates allowed — interviews are scheduled ahead)
- Interview `outcome` required, must be: Passed, Failed, Pending, Cancelled
- Interview `interviewers` max 500 chars
- Interview `notes` and `reflection` max 10,000 chars
- SAS token: 5-minute expiry, scoped to single blob; Azure Block Blob SAS does not support `Content-Length` constraints — processUpload checks blob size and deletes if > 10 MB (server-side enforcement); client-side validation is the first gate
- File names must end in `.pdf`, `.docx`, or `.html` (JD only)
- `contentType` must match file extension: `.pdf` → `application/pdf`, `.docx` → `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `.html` → `text/html`
- File content validated server-side by processUpload via magic bytes: PDF (`%PDF`), DOCX (`PK`/ZIP), HTML (`<!DOCTYPE` or `<html`); mismatched content → blob deleted, Cosmos not updated, returns 415

---

### Endpoint Detail: GET /api/applications

**Request:** `GET /api/applications?status=Interview%20Stage&sortBy=dateApplied&sortOrder=desc&page=1&pageSize=20`

**Response (200):**

```json
{
  "data": {
    "items": [
      {
        "id": "abc-123",
        "company": "Contoso Ltd",
        "role": "Senior Cloud Engineer",
        "location": {
          "city": "Sydney",
          "country": "Australia",
          "workMode": "Hybrid",
          "other": null
        },
        "dateApplied": "2026-03-15",
        "status": "Interview Stage",
        "jobPostingUrl": "https://careers.contoso.com/job/12345",
        "hasResume": true,
        "hasCoverLetter": true,
        "hasJobDescription": true,
        "interviewCount": 2,
        "createdAt": "2026-03-15T10:30:00Z",
        "updatedAt": "2026-03-25T16:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 47,
      "totalPages": 3
    }
  },
  "error": null
}
```

Note: List returns **summary** per application — no interview details, no JD text, no blob URLs. Use GET /:id for full detail.

---

### Endpoint Detail: GET /api/applications/:id

**Response (200):**

```json
{
  "data": {
    "id": "abc-123",
    "company": "Contoso Ltd",
    "role": "Senior Cloud Engineer",
    "location": {
      "city": "Sydney",
      "country": "Australia",
      "workMode": "Hybrid",
      "other": null
    },
    "dateApplied": "2026-03-15",
    "jobPostingUrl": "https://careers.contoso.com/job/12345",
    "jobDescriptionText": "We are looking for a Senior Cloud Engineer to...",
    "jobDescriptionFile": {
      "fileName": "contoso-jd.html",
      "uploadedAt": "2026-03-15T10:30:00Z"
    },
    "status": "Interview Stage",
    "resume": {
      "fileName": "contoso-resume.pdf",
      "uploadedAt": "2026-03-15T10:30:00Z"
    },
    "coverLetter": {
      "fileName": "contoso-cl.pdf",
      "uploadedAt": "2026-03-15T10:30:05Z"
    },
    "rejection": null,
    "interviews": [
      {
        "id": "int-uuid-1",
        "round": 1,
        "type": "Phone Screen",
        "date": "2026-03-20",
        "interviewers": "Jane Smith, Senior Manager",
        "notes": "Asked about Azure experience",
        "reflection": "Felt confident",
        "outcome": "Passed",
        "order": 1
      },
      {
        "id": "int-uuid-2",
        "round": 2,
        "type": "Technical",
        "date": "2026-03-25",
        "interviewers": "Bob Chen, Principal Engineer",
        "notes": "System design question",
        "reflection": "Struggled with caching layer",
        "outcome": "Failed",
        "order": 2
      }
    ],
    "isDeleted": false,
    "deletedAt": null,
    "createdAt": "2026-03-15T10:30:00Z",
    "updatedAt": "2026-03-25T16:00:00Z"
  },
  "error": null
}
```

Note: `blobUrl` is NOT returned here. Use the download SAS token endpoint to get time-limited download URLs.

**Response (404):**

```json
{
  "data": null,
  "error": { "code": "NOT_FOUND", "message": "Application abc-123 not found" }
}
```

---

### Endpoint Detail: POST /api/applications

**Request Body:**

```json
{
  "company": "Contoso Ltd",
  "role": "Senior Cloud Engineer",
  "location": {
    "city": "Sydney",
    "country": "Australia",
    "workMode": "Hybrid",
    "other": null
  },
  "dateApplied": "2026-03-15",
  "status": "Applying",
  "jobPostingUrl": "https://careers.contoso.com/job/12345",
  "jobDescriptionText": "We are looking for a Senior Cloud Engineer to..."
}
```

Note: Files are NOT uploaded here. Create the application first, then upload files via the SAS token endpoint.

**Response (201):** Returns the full application document (same shape as GET /:id) with generated `id`, `createdAt`, `updatedAt`, empty `interviews` array, and null file fields.

**Response (400):**

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "company", "message": "Required field" },
      { "field": "dateApplied", "message": "Cannot be in the future" }
    ]
  }
}
```

---

### Endpoint Detail: PATCH /api/applications/:id

**Request Body — send only changed fields:**

```json
{
  "status": "Rejected",
  "rejection": {
    "reason": "Failed Technical",
    "notes": "Couldn't solve the system design question"
  }
}
```

or:

```json
{ "status": "Application Submitted" }
```

or:

```json
{
  "location": {
    "city": "Melbourne",
    "country": "Australia",
    "workMode": "Remote",
    "other": null
  }
}
```

**Response (200):** Returns the full updated application (same shape as GET /:id).

Validation: If `status` is set to `Rejected`, `rejection.reason` is required in the same request or must already exist on the record.

---

### Endpoint Detail: DELETE /api/applications/:id

Sets `isDeleted: true` and `deletedAt` timestamp. Record is excluded from all GET queries. Blob files are NOT deleted.

**Response (200):**

```json
{ "data": { "id": "abc-123", "deleted": true }, "error": null }
```

---

### Endpoint Detail: PATCH /api/applications/:id/restore

Sets `isDeleted: false` and `deletedAt: null`. Record becomes visible again.

**Response (200):** Returns the full restored application (same shape as GET /:id).

---

### Endpoint Detail: POST /api/applications/:id/interviews

**Request Body:**

```json
{
  "type": "Technical",
  "date": "2026-03-25",
  "interviewers": "Bob Chen, Principal Engineer",
  "notes": "",
  "reflection": "",
  "outcome": "Pending"
}
```

Behavior:

- Generates UUID for the interview `id`
- Sets `round` to next sequential number
- Sets `order` to same value as round (user can reorder later)
- Appends to `interviews` array
- Updates `updatedAt` on parent application
- If application status is before "Interview Stage", auto-updates to "Interview Stage"

**Response (201):** Returns the full updated application with the new interview in the array.

---

### Endpoint Detail: PATCH /api/applications/:id/interviews/:interviewId

**Request Body — send only changed fields:**

```json
{
  "outcome": "Passed",
  "reflection": "Went better than expected. Solved the design problem."
}
```

**Response (200):** Returns the full updated application.
**Response (404):** If application or interview ID doesn't exist.

---

### Endpoint Detail: DELETE /api/applications/:id/interviews/:interviewId

Removes the interview from the array. Renumbers remaining rounds sequentially. Updates `updatedAt`.

**Response (200):** Returns the full updated application.

---

### Endpoint Detail: PATCH /api/applications/:id/interviews/reorder

**Request Body:**

```json
{ "order": ["int-uuid-2", "int-uuid-1", "int-uuid-3"] }
```

Array of interview IDs in desired display order. Updates the `order` field on each interview to match position.

Validation: All interview IDs must exist on the application. Array must contain ALL interview IDs (no partial reorder).

**Response (200):** Returns the full updated application with reordered interviews.

---

### Endpoint Detail: POST /api/upload/sas-token

**Request Body:**

```json
{
  "applicationId": "abc-123",
  "fileType": "resume",
  "fileName": "my-resume.pdf",
  "contentType": "application/pdf"
}
```

Validation: `applicationId` must exist. `fileType` must be `resume`, `coverLetter`, or `jobDescription`. `fileName` must end in `.pdf`, `.docx`, or `.html` (JD only). `contentType` must match extension.

**Response (200):**

```json
{
  "data": {
    "uploadUrl": "https://<storage>.blob.core.windows.net/resumes/abc-123/1710498900000-my-resume.pdf?sv=2021-06-08&se=2026-03-15T10:35:00Z&sr=b&sp=cw&sig=...",
    "blobPath": "resumes/abc-123/1710498900000-my-resume.pdf",
    "expiresAt": "2026-03-15T10:35:00Z"
  },
  "error": null
}
```

SAS token properties: 5-minute expiry, create+write only (no read/delete), single blob scope, 10 MB max content length.

Frontend upload flow:

1. Call POST /api/upload/sas-token → get `uploadUrl`
2. PUT file directly to `uploadUrl` (browser → Blob Storage)
3. Blob Storage fires BlobCreated event → Event Grid
4. Event Grid triggers processUpload Function:
   a. Validates blob size (≤ 10 MB) — deletes blob and exits if oversized
   b. Validates file content via magic bytes — deletes blob and exits if mismatched
   c. Reads existing Cosmos record for the applicationId
   d. Checks if application is soft-deleted — skips processing if `isDeleted: true`
   e. Compares blob timestamp against existing Cosmos `uploadedAt` — skips if older ("latest wins")
   f. Updates Cosmos record with new `blobUrl`, `fileName`, `uploadedAt` — old reference is replaced
   g. If a previous file of the same type exists, deletes the old blob from Blob Storage using the Function's storage connection string
5. Frontend refreshes to see updated file linked

**Overwrite behaviour:** Re-uploading any file type always replaces the previous file — no version history, only the latest is retained. Cosmos is written before the old blob is deleted, so if the delete fails, the record stays consistent and the orphaned blob is caught by the Blob Storage lifecycle policy (TTL: 90 days since last modified).

---

### Endpoint Detail: GET /api/download/sas-token

**Request:** `GET /api/download/sas-token?applicationId=abc-123&fileType=resume`

**Response (200):**

```json
{
  "data": {
    "downloadUrl": "https://<storage>.blob.core.windows.net/resumes/abc-123/my-resume.pdf?sv=2021-06-08&se=2026-03-15T10:35:00Z&sr=b&sp=r&sig=...",
    "fileName": "my-resume.pdf",
    "expiresAt": "2026-03-15T10:35:00Z"
  },
  "error": null
}
```

SAS token properties: 5-minute expiry, read-only, single blob scope.

**Response (404):** If no file of that type exists for the application.

---

### Endpoint Detail: GET /api/applications/stats

**Request:** `GET /api/applications/stats?from=2026-03-01&to=2026-03-18`

Defaults: `from` = first day of current month, `to` = today.

**Soft-deleted applications are always excluded** — `isDeleted: false` is applied to all stats queries. Deleted apps do not count toward any status totals or interview counts.

**Response (200):**

```json
{
  "data": {
    "period": { "from": "2026-03-01", "to": "2026-03-18" },
    "totalApplications": 47,
    "byStatus": {
      "Applying": 3,
      "Application Submitted": 12,
      "Recruiter Screening": 8,
      "Interview Stage": 5,
      "Pending Offer": 1,
      "Accepted": 2,
      "Rejected": 14,
      "Withdrawn": 2
    },
    "totalInterviews": 18,
    "interviewsByType": {
      "Phone Screen": 8,
      "Technical": 5,
      "Behavioral": 3,
      "Case Study": 1,
      "Panel": 1,
      "Take Home Test": 0,
      "Other": 0
    }
  },
  "error": null
}
```

---

### Endpoint Detail: GET /api/applications/deleted

Returns all soft-deleted applications, ordered by `deletedAt` descending (most recently deleted first). Supports the "recently deleted" / undo UI — user can see what they deleted and restore it via `PATCH /:id/restore`.

**Request:** `GET /api/applications/deleted`

**Response (200):**

```json
{
  "data": {
    "items": [
      {
        "id": "abc-123",
        "company": "Contoso Ltd",
        "role": "Senior Cloud Engineer",
        "location": {
          "city": "Sydney",
          "country": "Australia",
          "workMode": "Hybrid",
          "other": null
        },
        "dateApplied": "2026-03-15",
        "status": "Interview Stage",
        "jobPostingUrl": "https://careers.contoso.com/job/12345",
        "hasResume": true,
        "hasCoverLetter": true,
        "hasJobDescription": true,
        "interviewCount": 2,
        "createdAt": "2026-03-15T10:30:00Z",
        "updatedAt": "2026-03-25T16:00:00Z",
        "deletedAt": "2026-03-19T09:00:00Z"
      }
    ]
  },
  "error": null
}
```

Returns same summary shape as `GET /api/applications` list items, plus `deletedAt`. No pagination — deleted list is expected to be small for a single-user app.

---

### Endpoint Detail: DELETE /api/applications/:id/files/:fileType

Deletes a single uploaded file from an application. `fileType` must be `resume`, `coverLetter`, or `jobDescription`.

**Request:** `DELETE /api/applications/abc-123/files/resume`

Behaviour:

- Reads current Cosmos record to get the `blobUrl` for the given `fileType`
- Returns 404 if no file of that type exists on the application
- Deletes the blob from Blob Storage using the Function's storage connection string
- Sets the file field to `null` on the Cosmos record (`resume: null`, etc.)
- Updates `updatedAt` on the application

**Response (200):**

```json
{
  "data": { "id": "abc-123", "fileType": "resume", "deleted": true },
  "error": null
}
```

**Response (404):**

```json
{
  "data": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "No resume found for application abc-123"
  }
}
```

---

## Build Commands

```bash
# Frontend
cd client && npm install && npm run dev

# Backend (Azure Functions)
cd api && npm install && func start

# Deploy infrastructure
az deployment group create -g job-tracker-rg -f infra/main.bicep -p infra/parameters.json

# Deploy app (manual path today; GitHub Actions workflow planned for Phase 5)
swa deploy
```

## Project Structure

```
job-tracker/
├── .github/
│   ├── copilot-instructions.md
│   ├── agents/
│   ├── instructions/
│   └── prompts/
├── infra/
│   ├── main.bicep
│   └── parameters.json
├── api/
│   ├── functions/
│   ├── shared/
│   ├── package.json
│   └── host.json
├── client/
│   ├── src/
│   ├── public/
│   └── package.json
├── CLAUDE.md          ← this file (source of truth)
├── DEVLOG.md          ← session-by-session history
└── TIMELINE.md        ← project plan & estimates
```

## Conventions

- TypeScript everywhere (frontend + backend)
- Cosmos DB client as singleton in `api/shared/cosmosClient.ts`
- File uploads via SAS tokens — never proxy binary data through Functions
- All Functions return consistent `{ data, error }` response shape
- Environment variables prefixed: `COSMOS_`, `STORAGE_`, `EVENTGRID_`

## Recent Work

- 2026-03-18: Project planned, architecture designed, TIMELINE.md created
- 2026-03-18: Completed design steps 1–3 (user flow, data model, API contract)
- 2026-03-18: Added design rationale (why decisions were made for Steps 1–3), expanded API contract with full request/response examples, synced TIMELINE.md with current scope, removed stale data from TIMELINE.md
- 2026-03-19: Reviewed and completed Step 3 (API contract) — resolved gaps: file replacement/overwrite behaviour, deleted app listing endpoint, individual file delete endpoint, stats exclusion of deleted apps, and explicit 401/403 handling. Completed Step 4 (File Upload Architecture) — CORS, blob PUT headers, client-side validation, SAS issuance validation, processUpload fileType derivation, upload completion polling, failure handling, progress bar, concurrent uploads.
- 2026-03-19: Completed Step 5 (Event-Driven Pipeline) — chose Blob Storage system topic, single Event Grid subscription, Event Grid Schema, Event Grid trigger binding, BlobCreated-only filtering, dead-letter container, and default retry policy with idempotent processUpload expectations.
- 2026-03-19: Completed Step 6 (Authentication & Security) — locked SWA built-in GitHub auth, private owner-only route access, no browser API keys or custom JWT flow in v1, and pragmatic in-function throttling for sensitive API endpoints without adding APIM.
- 2026-03-19: Planned Step 7 (Infrastructure & Deployment) — locked IaC topology/resources, Bicep structure and outputs, deployment sequencing expectations, and explicitly gated Phase 1 execution pending planning-doc review.
- 2026-03-19: Phase 1 started — created `infra/main.bicep` and `infra/parameters.json` with all resources: Cosmos DB (free tier, jobtracker/applications, /id partition key, 400 RU/s), Storage Account (LRS, 4 blob containers, CORS for SWA origin, 90-day lifecycle policy), Log Analytics + App Insights, Azure Functions (Consumption, Linux, Node.js 20), Static Web Apps (free tier), Event Grid system topic (subscription conditional on processUpload deployment). Bicep validated successfully.
- 2026-03-19: Architecture decision — removed SWA linked backend. SWA Free tier does not support linking external Function Apps (`SkuCode 'Free' is invalid` error on deploy). Auth enforcement moved from SWA gateway to a shared `requireOwner()` helper in each Function, validating the `x-ms-client-principal` header. Updated CLAUDE.md and DEVLOG.md. Bicep updated to remove `swaLinkedBackend` resource.
- 2026-03-19: Phase 1 complete — full infrastructure deployed to Azure (16 resources). Outputs: SWA `gray-rock-0c358e300.1.azurestaticapps.net`, Function App `func-jobtracker`, Cosmos `https://cosmos-jobtracker.documents.azure.com:443/`, Storage `stjobtrackermliokt`, Event Grid topic `evgt-jobtracker`.
- 2026-03-21: Phase 2 started — scaffolded `api/` project (Azure Functions v4, Node.js 20, TypeScript, ESM, Vitest). Created shared utilities: `auth.ts` (requireOwner), `cosmosClient.ts` (singleton), `response.ts` (standard shapes), `types.ts` (domain types/enums), `validation.ts` (all validators). Implemented all 12 CRUD endpoints with TDD (184 tests, all passing): createApplication, getApplication, listApplications, updateApplication, deleteApplication, restoreApplication, listDeleted, getStats, addInterview, updateInterview, deleteInterview, reorderInterviews.
- 2026-03-21: Completed remaining Phase 2 endpoints: uploadSasToken (POST /api/upload/sas-token), downloadSasToken (GET /api/download/sas-token), deleteFile (DELETE /api/applications/:id/files/:fileType), processUpload (Event Grid trigger). All with full test coverage.
- 2026-03-21: Full Phase 2 code review — fixed critical mass assignment vulnerability in updateApplication (field whitelisting), added Content-Type header to auth error responses, handled invalid JSON body as 400 (not 500) across 6 endpoints, added STORAGE_ACCOUNT_KEY to local.settings.json, fixed processUpload stream API to use Node.js streams instead of Web API, documented SAS Content-Length constraint gap in CLAUDE.md, updated SOLUTION.md auth model to reflect Function-level enforcement. Removed unused deps (@azure/data-tables, uuid, @types/uuid). Added tests for mass assignment prevention, invalid JSON body handling, and rejection clearing edge case.
- 2026-03-21: Phase 2 second review — fixed remaining Medium/Low issues: M-1 (force initial status "Applying"), M-2 (post-merge rejection invariant check), M-3 (safety comment on ORDER BY interpolation), M-4 (sanitize nested location/rejection objects). Extracted shared utilities: `stripBlobUrl()` to response.ts, `FILE_TYPE_TO_FIELD`/`FILE_TYPE_CONTAINERS`/`VALID_FILE_TYPES_SET` to types.ts, new `storageClient.ts` singleton (mirrors cosmosClient.ts pattern). Removed duplicated constants/helpers from 7+ endpoint files. Updated createApplication tests for forced status. Created `docs/reviews/phase-2-code-review.md` documenting all issues and fixes.
- 2026-03-21: Phase 3 complete — deployed Function App to Azure (all 16 functions), enabled Event Grid subscription, E2E verified full upload pipeline (SAS token → blob PUT → Event Grid → processUpload → Cosmos update), verified re-upload (latest wins), download SAS, and file delete. Fixed: missing STORAGE_ACCOUNT_KEY env var (added to Bicep), processUpload `getProperties()` crash on Event Grid retry (added 404 try/catch), function registration glob issue (created `src/index.ts` single entry point). Dead-letter configured and verified (deadletter container, 30 retries, 24hr TTL).
- 2026-03-22: Phase 4 frontend — fixed all remaining deferred defects from code review: H-4 (removed redundant status), H-6 (formatApiError helper for field-level validation errors in toasts), M-2 (login page text), M-3 (empty table state with CTA), M-7 (ARIA sort headers), M-8 (ARIA file indicators), L-1 (per-card isRestoring), L-4 (replaced all emojis with Lucide React icons across 8 files), T-12 (added missing MSW handlers for interview CRUD and file delete). 35 tests passing, 0 TypeScript errors.
- 2026-03-22: Dashboard improvements — redesigned InterviewChart from flat "Interviews by Type" to "Interview Pipeline" with numbered stage progression (Phone Screen → Take Home Test → Technical → Behavioral → Case Study → Panel → Other), connector lines, and colored indicators. Fixed browser fetch caching (`cache: "no-store"` on all API calls). Added new DropoffChart component showing where applications ended/stalled ("No Response", "Pre-Interview", or by last interview stage). Updated backend getStats endpoint with `outcomesByStage` field. 35 frontend tests, 266 backend tests passing.
- 2026-03-22: Phase 4 marked complete and Phase 5 kicked off. Added detailed CI/CD plan at `docs/phase-5-cicd-deployment-plan.md` and aligned deployment/status references across docs.

---

## ⚠️ SESSION WORKFLOW — READ THIS BEFORE AND AFTER EVERY SESSION

### Starting a Session (on any machine)

1. `git pull` to get latest changes
2. Read this file to see current status
3. Read `DEVLOG.md` for recent session details if needed
4. Tell your AI: _"Read CLAUDE.md for project context"_ (Claude Code does this automatically)

### Ending a Session (on any machine)

**Before you commit and push, update these three things:**

1. **`CLAUDE.md` — Current Status section**
   - Check off completed phases
   - Update "Currently working on" line
   - Add any new decisions to "Decisions Made"
   - Add a line to "Recent Work" with today's date and summary

2. **`DEVLOG.md` — Append a new entry**

   ```markdown
   ## YYYY-MM-DD — [Machine] ([AI Tool])

   - What you accomplished
   - Any blockers or issues
   - What to pick up next
   ```

3. **Commit and push**
   ```bash
   git add CLAUDE.md DEVLOG.md
   git commit -m "update project context — [brief summary]"
   git push
   ```

### Quick Checklist (copy this into your commit message or just mentally run through it)

```
[ ] Updated CLAUDE.md status checkboxes
[ ] Updated "Currently working on" line
[ ] Added to "Recent Work"
[ ] Appended DEVLOG.md entry
[ ] Committed and pushed
```
