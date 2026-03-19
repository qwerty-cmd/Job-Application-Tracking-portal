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
