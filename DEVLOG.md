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
