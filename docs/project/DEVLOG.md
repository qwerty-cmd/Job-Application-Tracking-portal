# Development Log

Session-by-session history of work done on the Job Application Tracking Portal.
Each entry records what was done, on which machine, with which AI tool, and what's next.

---

## 2026-03-18 — Work Laptop (GitHub Copilot)

**What was done:**

- Project architecture designed (Azure free tier: SWA + Functions + Cosmos DB + Blob + Event Grid)
- Created TIMELINE.md with full phase breakdown, effort estimates, and Gantt view
- Decided on context-sharing strategy: CLAUDE.md as single source of truth
- Created CLAUDE.md, .github/copilot-instructions.md, and this DEVLOG.md

**Decisions made:**

- Azure over AWS (familiarity, simpler architecture, permanent free tiers)
- React + TypeScript for frontend
- Node.js/TypeScript Azure Functions for backend
- Cosmos DB NoSQL with /id partition key
- Event Grid for blob upload event streaming
- Bicep for IaC

**Blockers:** None

**Next session:** Start Phase 1 — scaffold Bicep templates for all Azure resources

---

## 2026-03-18 — Work Laptop (GitHub Copilot) — Session 2

**What was done:**

- Completed Step 1 (User Flow & Requirements):
  - Defined 6 baseline requirements (R1–R6) and 2 future AI requirements (R7–R8)
  - Locked in: location as structured (city/country/workMode/other), date defaults to today, job posting URL included
  - Status flow: Applying → Application Submitted → Recruiter Screening → Interview Stage → Pending Offer → Accepted | Rejected | Withdrawn
  - Rejection reason: dropdown (Ghosted, Failed Technical, etc.) + free text notes, "Other" allows free text
  - Interview rounds: numbered, reorderable, with types (Phone Screen, Technical, Behavioral, Case Study, Panel, Take Home Test, Other)
  - Job description capture: URL + paste text + file upload (HTML/PDF/DOCX)
  - Dashboard: count per status stage, configurable time period (default monthly)
  - File types: PDF + DOCX (resume/CL), PDF + DOCX + HTML (JD), max 10 MB

- Completed Step 2 (Data Model):
  - Embed interviews inside application document (not separate)
  - Partition key: /id (high cardinality, cheap point reads)
  - Soft delete with isDeleted + deletedAt (with undelete endpoint)
  - Interview order field for reordering
  - Adding first interview auto-updates status to "Interview Stage"
  - Full Cosmos DB document schema defined

- Completed Step 3 (API Contract):
  - 13 endpoints defined with full request/response shapes
  - Consistent { data, error } response wrapper
  - PATCH for partial updates, not PUT
  - Separate upload and download SAS token endpoints
  - Pagination, filtering, sorting for list endpoint
  - Validation rules for all inputs
  - Dashboard stats endpoint with configurable time period

- Updated CLAUDE.md with all decisions, requirements, data model, and API contract

**Decisions made:**

- Soft delete (isDeleted flag + deletedAt timestamp)
- Embed interviews inside application (not separate docs)
- Interviews reorderable via order field
- Adding first interview auto-updates status
- Separate download endpoint (not extend upload)
- Undelete/restore endpoint included
- PATCH not PUT for updates
- Job description: URL + text paste + file upload (Option A)
- Rejection reason: dropdown + free text (both)
- Dashboard: count per stage (no success/rejection rate)

**Blockers:** None

**Next session:** Continue Phase 0 design — Steps 4 (File Upload Architecture), 5 (Event Pipeline), 6 (Auth), 7 (Infra & Deployment). Then start Phase 1 (Bicep).

---

## 2026-03-18 — Work Laptop (GitHub Copilot) — Session 3

**What was done:**

- Added Design Rationale section to CLAUDE.md — captures _why_ each decision was made for Steps 1, 2, and 3
- Expanded API Endpoints section in CLAUDE.md with full contract detail:
  - Complete request/response JSON examples for all 13 endpoints
  - HTTP status codes table
  - Full validation rules
  - SAS token upload/download flow description
- Reviewed all solution docs for consistency
- Fixed TIMELINE.md:
  - Removed stale data model and repo structure (replaced with pointer to CLAUDE.md)
  - Added interview CRUD + dashboard stats + restore endpoint to Phase 2 backlog
  - Added interview management UI to Phase 4 backlog
  - Updated effort estimates (Phase 2: 8–9 hrs, Phase 4: 13–15 hrs, Total: 53–62 hrs)
  - Updated Gantt view to 5 weeks
- Fixed duplicated sections in CLAUDE.md (session workflow was repeated)

**Decisions made:**

- CLAUDE.md is the authoritative design doc; TIMELINE.md is for effort planning only
- Full API contract detail captured in CLAUDE.md so Claude Code can generate precise code

**Blockers:** None

**Next session:** Continue Phase 0 design — Steps 4 (File Upload Architecture), 5 (Event Pipeline), 6 (Auth), 7 (Infra & Deployment). Then start Phase 1 (Bicep).

---

## 2026-03-19 — Home (Claude Code)

**What was done:**

- Cloned repo to local machine
- Reviewed Step 3 (API Contract) and resolved gaps:
  - File replacement behaviour → overwrite via `processUpload` + 90-day lifecycle policy safety net
  - No deleted app listing → added `GET /api/applications/deleted`
  - No individual file delete → added `DELETE /api/applications/:id/files/:fileType`
  - Stats didn't explicitly exclude deleted apps → documented `isDeleted: false` filter
  - No 401/403 in status codes → added with note that SWA gateway handles both
- Completed Step 4 (File Upload Architecture):
  - CORS on Blob Storage (Bicep, SWA origin only)
  - Required blob PUT headers (`x-ms-blob-type: BlockBlob`, `Content-Type`)
  - Client-side validation before SAS token request
  - SAS token issuance validation (applicationId exists, fileType enum, file extension)
  - `processUpload` fileType derivation from container name
  - Upload completion detection via polling (`GET /:id` every 2s, max 15s)
  - Upload failure handling (retry from scratch, no partial recovery needed)
  - Upload progress via `XMLHttpRequest.upload.onprogress`
  - Concurrent uploads allowed (independent SAS tokens + blob paths)

**Decisions made:**

- File re-upload = overwrite; Cosmos written before old blob deleted (consistency first)
- Blob Storage lifecycle policy: 90-day TTL as safety net (free feature)
- Polling over SignalR for upload completion (simpler, sufficient for v1)
- XHR over fetch for upload progress (better `onprogress` support)

**Blockers:** None

**Next session:** Step 5 (Event-Driven Pipeline), Step 6 (Auth), Step 7 (Infra & Deployment). Then start Phase 1 (Bicep).

---

## 2026-03-19 — Home (GitHub Copilot) — Session 5

**What was done:**

- Completed Step 5 (Event-Driven Pipeline):
  - Chose Blob Storage system topic (not custom topic)
  - Single Event Grid subscription (not one per container) — processUpload filters by container name
  - Event Grid Schema (not CloudEvents 1.0) — Azure-only project, simpler
  - Event Grid trigger binding (not HTTP webhook) — removes manual subscription validation
  - BlobCreated-only filter — excludes delete events from lifecycle policy
  - Dead-letter to dedicated `deadletter` blob container for inspection/replay
  - Default retry policy: 30 attempts, 24-hour TTL
  - Idempotency via "latest wins" timestamp + "blob not found = success" on retries

- Completed Step 6 (Authentication & Security):
  - SWA built-in GitHub provider (no custom identity)
  - Private app with custom `owner` role (not just `authenticated`)
  - SWA gateway enforces 401/403 before Functions execute
  - No API keys for browser-to-API auth — SWA manages session/client principal
  - No custom JWT issuance/validation in v1
  - No API Management in v1 — targeted in-function throttling for sensitive endpoints
  - Defence in depth: Functions still validate payloads/business rules

- Completed Step 7 (Infrastructure & Deployment — planning only):
  - Locked IaC topology: SWA + Functions + Cosmos + Storage + Event Grid
  - Bicep structure: `infra/main.bicep` + `infra/parameters.json`
  - 4 blob containers: `resumes`, `coverletters`, `jobdescriptions`, `deadletter`
  - Required outputs: SWA hostname, Function app name, Cosmos endpoint, Storage account name
  - Explicitly gated: no Phase 1 execution until planning docs vetted

- Cross-document gap analysis (CLAUDE.md, DEVLOG.md, TIMELINE.md):
  - Found 15 issues (4 Critical, 4 High, 4 Medium, 3 Low)
  - Fixed all 15: stale TIMELINE.md references, processUpload step ordering, missing validation rules, inconsistent response examples, effort estimate updates, moved auth from Phase 6 to Phase 1

**Decisions made:**

- Event Grid Schema over CloudEvents (Azure-only, simpler docs alignment)
- System topic + single subscription (not custom topic, not per-container)
- SWA built-in auth enforced at gateway (not in Functions)
- No APIM/JWT/API keys in v1 (owner-only access is sufficient)
- Step 7 is planning-only — Phase 1 gated behind planning review

**Blockers:** None

**Next session:** Final planning review, then start Phase 1 (Bicep infrastructure).

---

## 2026-03-19 — Work Laptop (GitHub Copilot) — Session 6

**What was done:**

- Phase 1 started — created Bicep infrastructure templates
- Created `infra/main.bicep` with all resources:
  - Cosmos DB (free tier, Session consistency, database `jobtracker`, container `applications`, partition key `/id`, 400 RU/s)
  - Storage Account (Standard_LRS, TLS 1.2, no public blob access)
  - Blob Service with CORS (SWA origin only, PUT/GET/HEAD)
  - 4 blob containers: `resumes`, `coverletters`, `jobdescriptions`, `deadletter`
  - Lifecycle policy: 90-day TTL on app blob containers
  - Log Analytics Workspace + Application Insights
  - App Service Plan (Consumption/Y1, Linux)
  - Function App (Node.js 20, Functions v4, all app settings: Cosmos, Storage, App Insights)
  - Azure Static Web Apps (Free tier)
  - SWA linked backend to Function App
  - Event Grid system topic from Storage
  - Event Grid subscription (conditional, BlobCreated filter with advanced subject filtering for upload containers, dead-letter to `deadletter` container, 30 retries / 24hr TTL)
- Created `infra/parameters.json` with environment values
- Bicep validated successfully (`az bicep build` — exit code 0, no errors)
- Updated CLAUDE.md status and recent work

**Decisions made:**

- Linux over Windows for Function App (better Node.js support)
- Event Grid subscription is conditional (`deployEventGridSubscription` param) — deploy after processUpload function exists
- Advanced subject filters on Event Grid subscription (limit to 3 upload containers only, exclude Functions runtime blobs)
- Storage account name uses `uniqueString` suffix for global uniqueness
- CORS on blob service references specific SWA hostname (not wildcard)
- All Function App settings configured in Bicep (Cosmos, Storage, App Insights env vars)

**Blockers:** None

**Next session:** Deploy infrastructure to Azure (`az deployment group create`), verify outputs, then start Phase 2 (Backend API).

---

## 2026-03-19 — Home (Claude Code) — Session 7

**What was done:**

- Installed Azure CLI (2.84.0) and Azure Functions Core Tools (4.8.0)
- Logged into Azure, created resource group `job-tracker-rg` in `australiaeast`
- Ran `az deployment group what-if` — 17 resources validated, all correct
- Attempted full deploy — failed on `Microsoft.Web/staticSites/swa-jobtracker/linkedBackends/backend` with error: `SkuCode 'Free' is invalid`
- Root cause: SWA Free tier does not support `linkedBackends` (linking an external Function App); this is a Standard-tier-only feature
- Decision: remove linked backend, keep SWA Free, enforce auth inside each Function using `x-ms-client-principal` header — same security outcome, zero extra cost
- Updated CLAUDE.md to reflect the revised auth model:
  - Decisions Made: replaced gateway enforcement decision with Function-level enforcement + noted SWA linked backend removal
  - Step 6 rationale: replaced "Gateway-enforced authorization" point with "Function-level auth" point explaining the tradeoff
  - Step 7 rationale: updated "Separate SWA and Functions resources" note to record the linked backend removal and its cause
  - HTTP status codes table: updated 401/403 descriptions to reference Function auth guard
  - Step 3 rationale: updated 401/403 note to reference `requireOwner()` helper

**Decisions made:**

- No SWA linked backend — SWA Free tier limitation discovered during deployment
- Auth enforcement in Functions via `x-ms-client-principal` header + `requireOwner()` shared helper in `api/shared/auth.ts`
- 401/403 returned by Functions, not by SWA gateway

**Blockers:** None — 8 of 9 resources deployed successfully (Cosmos, Storage, Log Analytics, App Insights, App Service Plan, Function App, SWA, Event Grid topic). Only linked backend skipped.

**Next session:** Remove `swaLinkedBackend` resource from `infra/main.bicep`, redeploy to confirm clean deployment, verify outputs, then start Phase 2 (Backend API).

---

## 2026-03-19 — Home (Claude Code) — Session 8

**What was done:**

- Removed `swaLinkedBackend` resource from `infra/main.bicep` (replaced with explanatory comment)
- Redeployed — `provisioningState: Succeeded`, 16 resources, no errors
- Verified deployment outputs:
  - SWA hostname: `gray-rock-0c358e300.1.azurestaticapps.net`
  - Function App: `func-jobtracker`
  - Cosmos endpoint: `https://cosmos-jobtracker.documents.azure.com:443/`
  - Storage account: `stjobtrackermliokt`
  - Event Grid topic: `evgt-jobtracker`
- Phase 1 marked complete in CLAUDE.md

**Decisions made:** None new — executed the linked backend removal decided in Session 7.

**Blockers:** None

**Next session:** Phase 2 — Backend API. Scaffold `api/` directory, implement Azure Functions for all CRUD endpoints, file upload/download SAS token endpoints, and `api/shared/auth.ts` requireOwner helper.

---

## 2026-03-21 — Work (VS Code Copilot) — Session 9

**What was done:**

- Scaffolded `api/` project: Azure Functions v4, Node.js 20, TypeScript, ESM modules, Vitest
- Created project config: `package.json`, `tsconfig.json`, `tsconfig.test.json`, `vitest.config.ts`, `host.json`, `.gitignore`
- Created shared utilities in `api/src/shared/`:
  - `auth.ts` — `decodeClientPrincipal()` and `requireOwner()` for SWA auth
  - `cosmosClient.ts` — singleton Cosmos DB container accessor
  - `response.ts` — `successResponse()`, `errorResponse()`, `validationError()`, `notFoundError()`, `serverError()`
  - `types.ts` — all domain types, enums, interfaces (`Application`, `Interview`, `ApplicationSummary`, `StatsResponse`)
  - `validation.ts` — all validation functions for create/update application, create/update interview, SAS token requests
- Implemented 12 CRUD endpoints with TDD (184 tests, all passing):
  - `createApplication` — POST, 30 tests
  - `getApplication` — GET by ID with blobUrl stripping, 10 tests
  - `listApplications` — GET with filters/pagination/sorting, 15 tests
  - `updateApplication` — PATCH partial update, 16 tests
  - `deleteApplication` — soft DELETE, 7 tests
  - `restoreApplication` — PATCH restore, 7 tests
  - `listDeleted` — GET deleted summaries, 7 tests
  - `getStats` — GET stats with date range aggregation, 16 tests
  - `addInterview` — POST with auto-status update, 27 tests
  - `updateInterview` — PATCH partial interview update, 18 tests
  - `deleteInterview` — DELETE with round renumbering, 13 tests
  - `reorderInterviews` — PATCH reorder with validation, 18 tests
- Fixed TypeScript errors: `.js` → `.ts` in test imports, `parseBody` type widening, `Interview` type casts in updateInterview

**Decisions made:**

- Test imports use `.ts` extension (vitest resolves directly), production imports use `.js` (Node16 ESM convention)
- `tsconfig.test.json` extends main config but includes test files for IDE type-checking
- `parseBody` helper in tests uses `{ body?: unknown }` to match `HttpResponseInit.body`

**Blockers:** None — all 184 tests pass across 12 files.

**Next session:** Continue Phase 2 — implement SAS token upload/download endpoints, file delete endpoint, and `processUpload` Event Grid trigger function.

---

## 2026-03-21 — Work (VS Code Copilot) — Session 10

**What was done:**

- Implemented remaining Phase 2 endpoints with full TDD:
  - `uploadSasToken` (POST /api/upload/sas-token) — SAS token generation with application validation, file type/extension/contentType validation
  - `downloadSasToken` (GET /api/download/sas-token) — read-only SAS token for existing files
  - `deleteFile` (DELETE /api/applications/:id/files/:fileType) — blob deletion + Cosmos field nulling
  - `processUpload` (Event Grid trigger) — size check, magic bytes validation, soft-delete skip, latest-wins timestamp, old blob cleanup
- Full Phase 2 code review (security audit + consistency check):
  - **C-1 (Critical):** Fixed mass assignment vulnerability in `updateApplication` — added field whitelist (`company`, `role`, `location`, `dateApplied`, `status`, `jobPostingUrl`, `jobDescriptionText`, `rejection`)
  - **H-1:** Added `Content-Type: application/json` header to `requireOwner()` 401/403 responses
  - **H-2:** Wrapped `req.json()` in try/catch across 6 endpoints to return 400 instead of 500 on invalid JSON
  - **H-3:** Added `STORAGE_ACCOUNT_KEY` to `local.settings.json`
  - **H-4:** Documented SAS `Content-Length` constraint gap in CLAUDE.md (Azure Block Blob SAS doesn't support it)
  - **H-5:** Fixed `processUpload` stream handling — replaced Web API `ReadableStream.getReader()` with Node.js `for await...of` + range download
- Updated SOLUTION.md — fixed auth model in 5 locations to reflect Function-level enforcement (not SWA gateway)
- Updated CLAUDE.md — checked off Phase 2, updated "Currently working on" to Phase 3, added recent work entries
- Removed unused dependencies: `@azure/data-tables`, `uuid`, `@types/uuid`
- Added missing tests: invalid JSON body handling, mass assignment prevention, rejection clearing edge case

**Decisions made:**

- `updateApplication` whitelists updatable fields before merging — prevents overwriting `id`, `isDeleted`, `createdAt`, `interviews`, file fields
- Auth errors now return proper `HttpResponseInit` with `Content-Type` header (was returning raw `{ status, body }`)
- `processUpload` uses Node.js streams + range download (0, 16) instead of downloading entire blob for magic bytes check

**Blockers:** None — Phase 2 complete. All 220+ tests pass across 16 files.

**Next session:** Phase 3 — Event Streaming Pipeline. Deploy Event Grid subscription, test end-to-end upload flow.

## 2026-03-21 — Work (GitHub Copilot / Claude Opus 4.6)

**Phase 2 second code review — Medium/Low issue fixes + shared utility extraction**

- Fixed M-1: `createApplication` now forces `status: "Applying"` — ignores any status in request body (per R1)
- Fixed M-2: `updateApplication` added post-merge invariant check — if merged status is "Rejected" and no `rejection.reason` exists, returns 400
- Fixed M-3: Added safety comment on `ORDER BY` interpolation in `listApplications` explaining why it's safe (whitelist-validated)
- Fixed M-4: Created `sanitizeLocation()` and `sanitizeRejection()` helpers to whitelist nested object fields in create/update endpoints
- Extracted `stripBlobUrl()` to `api/src/shared/response.ts` — removed duplicated copies from 7 endpoint files
- Extracted `FILE_TYPE_TO_FIELD`, `FILE_TYPE_CONTAINERS`, `VALID_FILE_TYPES_SET` to `api/src/shared/types.ts` — removed from 4 endpoint files
- Created `api/src/shared/storageClient.ts` — singleton `BlobServiceClient` with env var validation (mirrors `cosmosClient.ts` pattern)
- Updated all 4 storage-using endpoints (uploadSasToken, downloadSasToken, deleteFile, processUpload) to use shared `storageClient.ts`
- Updated `reorderInterviews` to use shared `validateReorderRequest()` from `validation.ts`
- Updated `createApplication` tests for forced "Applying" status behaviour
- Created `docs/reviews/phase-2-code-review.md` documenting all issues found and fixes applied across both reviews

**Decisions made:**

- Initial status is always "Applying" — even if client sends a different status, it's ignored (defence in depth for R1)
- Post-merge validation catches race conditions where status becomes "Rejected" without a rejection reason
- Storage client follows same singleton + env var validation pattern as Cosmos client

**Blockers:** None — all fixes applied. Need to run tests when Node.js is available to verify.

**Next session:** Run tests to confirm all 230+ pass, then Phase 3 — Event Streaming Pipeline.

---

## 2026-03-21 — Work Laptop (GitHub Copilot)

**What was done:**

- Phase 3 (Event Streaming Pipeline) — complete
- Ran full test suite: 261 tests pass across 16 files
- Deployed Function App to Azure (`func-jobtracker`):
  - Created `.funcignore` to exclude source/test files from deployment package
  - Moved `@azure/functions` from devDependencies to dependencies (required at runtime)
  - Fixed function registration: glob pattern `dist/functions/*/index.js` in package.json `main` field didn't resolve on Linux Consumption; created `src/index.ts` as single entry point importing all 16 functions, set `main: "dist/index.js"`
  - All 16 functions deployed (15 HTTP + 1 Event Grid trigger)
- Enabled Event Grid subscription (`deployEventGridSubscription: true` in parameters.json)
- Deployed infrastructure update via `az deployment group create` — Event Grid subscription `process-upload` active
- E2E upload pipeline verified end-to-end:
  - Created test application via POST /api/applications
  - Got SAS token via POST /api/upload/sas-token
  - Uploaded PDF blob directly to Azure Storage via PUT
  - Event Grid fired BlobCreated → processUpload triggered → Cosmos updated with resume metadata
  - Verified GET /api/applications/:id shows resume fileName and uploadedAt
- E2E re-upload verified:
  - Uploaded second PDF with different filename
  - processUpload updated Cosmos with new fileName/uploadedAt (latest wins)
- E2E download verified:
  - GET /api/download/sas-token returned read-only SAS URL
  - Downloaded file content matched uploaded content
- E2E file delete verified:
  - DELETE /api/applications/:id/files/resume removed blob and nulled Cosmos field
  - Second DELETE returned 404 (correct — no file to delete)
- Fixed missing `STORAGE_ACCOUNT_KEY` environment variable:
  - SAS token endpoints returned 500 because env var wasn't set
  - Added via `az functionapp config appsettings set` (immediate fix)
  - Updated `infra/main.bicep` to include STORAGE_ACCOUNT_KEY app setting (permanent fix)
- Fixed processUpload bug — `getProperties()` crash on Event Grid retry:
  - When a re-upload occurs, processUpload deletes the old blob;
    if Event Grid retries the original upload's event, `getProperties()` throws 404
  - Added try/catch around `getProperties()` — returns early on 404 with log message
- Dead-letter infrastructure verified:
  - Event Grid subscription configured with dead-letter to `deadletter` blob container
  - Retry policy: 30 attempts, 24-hour TTL (service defaults)
  - Dead-letter container exists and is empty (no failures during testing)
  - Event filtering: BlobCreated only, advanced subject filter for resumes/coverletters/jobdescriptions
- Cleaned up test application (soft-deleted)

**Decisions made:**

- Single entry point pattern (`src/index.ts`) instead of glob in package.json `main` — more reliable across Azure Functions runtimes
- `STORAGE_ACCOUNT_KEY` added to Bicep (was only in local.settings.json previously)
- Dead-letter verification is configuration-only (no intentional failure test) — triggering 30 consecutive failures over 24 hours isn't practical for manual testing

**Blockers:** None

**Next session:** Phase 4 — Frontend (React + TypeScript with Vite).

---

## 2026-03-22 — Work Laptop (GitHub Copilot)

**What was done:**

- Fixed all remaining deferred defects from Phase 4 code review (9 items):
  - **H-4:** Removed redundant `status: "Applying"` from CreateApplicationModal — backend enforces initial status
  - **H-6:** Created `formatApiError()` helper in `lib/utils.ts` — surfaces field-level validation error details in toast messages across all 3 pages (ApplicationsPage, ApplicationDetailPage, DeletedApplicationsPage)
  - **M-2:** Updated LoginPage text to "Track your job search journey in one place." + "Private app · Owner only" note
  - **M-3:** Added empty state to ApplicationsTable with "No applications yet" message, description, and "+ New Application" CTA button (wired via `onCreateClick` prop)
  - **M-7:** Added ARIA attributes to sortable table headers: `role="columnheader"`, `aria-sort` (ascending/descending/none), `tabIndex={0}`, keyboard handler (Enter/Space)
  - **M-8:** Added `aria-label` to file indicator spans ("Resume uploaded" / "No resume", etc.)
  - **L-1:** Changed `isRestoring` from shared boolean to per-card `restoringId` tracking in DeletedApplicationsPage
  - **L-4:** Replaced ALL emojis/symbols with Lucide React icons across 8 files:
    - `ApplicationsTable.tsx`: ✓/✗ → Check/X, ▲/▼ → ChevronUp/ChevronDown, ←/→ → ChevronLeft/ChevronRight
    - `DetailHeader.tsx`: ← → ArrowLeft, 📍 → MapPin, 📅 → Calendar, 🗑 → Trash2
    - `DetailFields.tsx`: 🔗 → ExternalLink
    - `FileSection.tsx`: ⬇ → Download, 🔄 → RefreshCw, 🗑 → Trash2, 📤 → Upload
    - `InterviewList.tsx`: 📅 → Calendar, 👤 → User
    - `DeletedApplicationCard.tsx`: 📍 → MapPin, 📅 → Calendar, 🔄 → RotateCcw
    - `DeletedApplicationsPage.tsx`: 🗑 → Trash2
  - **T-12:** Added missing MSW handlers: PATCH/DELETE interview, reorder interviews, DELETE file
- Updated `docs/reviews/phase-4-frontend-review.md` — all fixed items marked, summary table updated
- Verified: 0 TypeScript errors, 35/35 tests passing (all 5 test files)

**Remaining deferred items:**

- M-1: Drag-and-drop interview reorder (feature work — polish phase)
- L-3: LoginPage.test.tsx (test coverage — future)
- T-1 through T-8: Additional test coverage gaps (future)

**Blockers:** None

**Next session:** Continue Phase 4 or begin Phase 5 — CI/CD & Deployment.

---

## 2026-03-22 — Work Laptop (GitHub Copilot) — Session 2

**What was done:**

- Redesigned InterviewChart component from flat "Interviews by Type" bar chart to "Interview Pipeline" visualization:
  - Logical stage ordering: Phone Screen → Take Home Test → Technical → Behavioral → Case Study → Panel → Other
  - Numbered step indicator circles (colored when count > 0, muted when 0)
  - Vertical connector lines between stages
  - Updated title to "Interview Pipeline" with "{n} interview(s) conducted" description
- Fixed browser fetch caching issue — stats and other API data wasn't refreshing after mutations:
  - Added `cache: "no-store"` to `RequestInit` options in `client/src/lib/api.ts`
- Created new DropoffChart component (`client/src/components/DropoffChart.tsx`):
  - Shows where applications ended or stalled ("No Response", "Pre-Interview", or by last interview stage)
  - Only renders non-zero stages, with empty state message when total is 0
  - Horizontal bar chart with color coding
- Updated backend `getStats` endpoint with `outcomesByStage` field:
  - Rejected/Withdrawn apps with interviews → counted by last interview type
  - Rejected with no interviews → "Pre-Interview"
  - Applying/Application Submitted → "No Response"
  - Active apps and soft-deleted apps excluded
- Updated MSW stats handler to compute `outcomesByStage` from in-memory store
- Added `outcomesByStage: Record<string, number>` to `StatsResponse` type
- Added 5 new backend tests for outcomesByStage (266 total backend tests)
- Fixed test collisions between InterviewChart and DropoffChart (both rendering "Phone Screen")
- All tests passing: 35 frontend, 266 backend

**Files changed:**

- `client/src/components/InterviewChart.tsx` — rewritten as pipeline
- `client/src/components/DropoffChart.tsx` — new component
- `client/src/lib/api.ts` — added `cache: "no-store"`
- `client/src/types/index.ts` — added `outcomesByStage` to StatsResponse
- `client/src/mocks/handlers.ts` — updated stats handler with outcomesByStage
- `client/src/pages/DashboardPage.tsx` — added DropoffChart rendering
- `client/src/pages/DashboardPage.test.tsx` — updated fixedStats, fixed assertions
- `api/src/functions/getStats/index.ts` — added outcomesByStage computation
- `api/src/functions/getStats/getStats.test.ts` — added 5 new tests

**Blockers:** None

**Next session:** Continue Phase 4 polish or begin Phase 5 — CI/CD & Deployment.

---

## 2026-03-22 — Work Laptop (GitHub Copilot) — Session 3

**What was done:**

- Marked Phase 4 complete and shifted active focus to Phase 5 in project context docs
- Created detailed Phase 5 execution plan at `docs/plans/phase-5-cicd-deployment-plan.md` including:
  - CI/CD deliverables and quality gates
  - GitHub secrets and environment variable requirements
  - Backend deployment strategy decision options
  - Production smoke-test and rollback checklist
  - Definition of done and risk mitigations
- Performed cross-document consistency pass and corrected mismatches:
  - Updated CLAUDE.md current status and "currently working on"
  - Updated CLAUDE.md deploy command note to manual path while CI/CD is being implemented
  - Updated CLAUDE.md project structure to match current repo (no workflow file yet)
  - Updated TIMELINE.md Phase 5 section with reference to the new detailed plan
  - Updated SOLUTION.md project structure to indicate workflow folder is Phase 5 work
  - Updated docs/guides/development-modes.md wording so GitHub Actions deployment is described as post-setup

**Decisions made:**

- Keep backend deployment strategy as a tracked Phase 5 decision (manual now vs automated in a follow-up workflow) while prioritizing frontend CI/CD first

**Blockers:** None

**Next session:** Implement `.github/workflows/azure-static-web-apps.yml`, configure repo secrets, run first deployment, and execute the production smoke-test checklist.

---

## 2026-03-23 — Work Laptop (GitHub Copilot) — Session 4

**What was done:**

- Implemented frontend CI/CD workflow at `.github/workflows/azure-static-web-apps.yml`:
  - `push` and `pull_request` triggers on `main`
  - `workflow_dispatch` enabled
  - Quality gates (`npm ci`, test, build)
  - Deploy job using prebuilt `dist` artifact
- Implemented backend CI/CD workflow at `.github/workflows/azure-functions.yml`:
  - `push` and `pull_request` triggers on `main` scoped to `api/**`
  - `workflow_dispatch` enabled
  - Quality gates (`npm ci`, test, build)
  - Artifact-based deployment via `Azure/functions-action@v1`
  - Pre-deploy guard for `WEBSITE_RUN_FROM_PACKAGE` ZipDeploy compatibility

**Decisions made:**

- Standardized both workflows to support manual runs while preventing non-main deployment.
- Backend deployment strategy moved from manual CLI publish to GitHub Actions workflow.

**Blockers:** None

**Next session:** Validate secrets, run first production deployment from `main`, and execute Phase 5 smoke tests.

---

## 2026-03-23 — Work Laptop (GitHub Copilot) — Session 5

**What was done:**

- Updated deploy conditions in both workflows so deploy jobs run for:
  - `push` on `main`
  - `workflow_dispatch` when ref is `main`
- Synchronized Phase 5 docs with implemented state:
  - Updated baseline/strategy/tracking in `docs/plans/phase-5-cicd-deployment-plan.md`
  - Updated secrets checklist in `docs/plans/cicd-secrets-checklist.md`
  - Updated CI/CD quick links and architecture line in `docs/project/CLAUDE.md`

**Decisions made:**

- Keep deploy gate as `main` only for both static web app and function app workflows.

**Blockers:** None

**Next session:** Record deployment evidence (run IDs + smoke test outcomes) and close remaining Phase 5 checklist items.
