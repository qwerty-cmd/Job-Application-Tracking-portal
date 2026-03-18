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

- [ ] Phase 0: Architecture & Design — **in progress (Steps 1–3 done, Steps 4–7 remain)**
- [ ] Phase 1: Infrastructure (Bicep)
- [ ] Phase 2: Backend API (CRUD Functions)
- [ ] Phase 3: Event Streaming Pipeline
- [ ] Phase 4: Frontend (React)
- [ ] Phase 5: CI/CD & Deployment
- [ ] Phase 6: Polish & Showcase-Ready

**Currently working on:** Phase 0 — Steps 1–3 complete. Added design rationale and full API contract detail to CLAUDE.md. Synced TIMELINE.md. Next: Step 4 (File Upload Architecture), Step 5 (Event Pipeline), Step 6 (Auth), Step 7 (Infra & Deployment).

## Design Steps Tracker

| Step | Topic                       | Status      |
| ---- | --------------------------- | ----------- |
| 1    | User Flow & Requirements    | ✅ Done     |
| 2    | Data Model (Cosmos DB)      | ✅ Done     |
| 3    | API Contract                | ✅ Done     |
| 4    | File Upload Architecture    | Not started |
| 5    | Event-Driven Pipeline       | Not started |
| 6    | Authentication & Security   | Not started |
| 7    | Infrastructure & Deployment | Not started |

## Decisions Made

- Partition key: `/id`
- Blob path structure: `{containerName}/{applicationId}/{filename}`
- Blob containers: `resumes`, `coverletters`, `jobdescriptions`
- SAS token expiry: 5 minutes
- SAS token scope: single blob, create+write only (no read/delete)
- Auth: Azure SWA built-in GitHub provider (restrict to personal account)
- Cosmos DB client: singleton pattern in `api/shared/cosmosClient.ts`
- File uploads: direct browser → Blob via SAS token (never proxy through Functions)
- Soft delete (isDeleted flag + deletedAt timestamp, with undelete endpoint)
- Embed interviews inside application document (not separate documents)
- Interview rounds are reorderable (numeric `order` field)
- Adding first interview auto-updates status to "Interview Stage"
- File download uses a separate endpoint from upload SAS token
- Location: structured (city, country, workMode) + Other free text
- Date applied defaults to today
- Job description capture: URL + paste text + file upload (all optional)
- Allowed file types: PDF, DOCX for resume/cover letter; PDF, DOCX, HTML for job description
- Max file size: 10 MB per file
- Dashboard: count per status stage, configurable time period (default monthly)
- Interview reflections field included in v1 (AI placeholder for v2)
- API responses use consistent `{ data, error }` shape
- PATCH for partial updates (not PUT)

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

### Step 3 — Why This API Design?

- **PATCH over PUT:** PUT requires sending the entire object. PATCH lets you send only what changed — better for updating just the status or adding a rejection reason.
- **Consistent `{ data, error }` response shape:** Frontend never has to guess the shape. Always check `response.error` first.
- **Separate upload and download SAS token endpoints:** Upload tokens need create+write permissions on a new blob path. Download tokens need read permission on an existing blob. Different scoping and validation — cleaner as separate endpoints.
- **List endpoint returns summary, not full document:** No interview details, no JD text, no blob URLs in the list response. Keeps it small and fast. Frontend calls GET /:id when user clicks into a specific application.
- **Auto-update status to "Interview Stage" when first interview added:** Reduces manual status management. If you're adding interviews, you're in the interview stage.
- **SAS token with 5-minute expiry, single-blob scope:** Short-lived = limits window of misuse. Single-blob scope = token can't be used to access other files. Create+write only = can't read or delete other blobs.
- **Pagination with max 100 per page:** Prevents accidentally dumping hundreds of records in one response. 20 is default, 100 is the ceiling.

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

**Container:** `applications` | **Partition Key:** `/id` | **Soft delete:** `isDeleted` + `deletedAt`

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

### HTTP Status Codes Used

| Code | Meaning                | When Used                                                 |
| ---- | ---------------------- | --------------------------------------------------------- |
| 200  | OK                     | Successful GET, PATCH, DELETE                             |
| 201  | Created                | Successful POST                                           |
| 400  | Bad Request            | Validation failed (missing fields, invalid enum)          |
| 404  | Not Found              | Application/interview ID doesn't exist or is soft-deleted |
| 413  | Payload Too Large      | File exceeds 10 MB                                        |
| 415  | Unsupported Media Type | File type not PDF/DOCX/HTML                               |
| 500  | Internal Server Error  | Unexpected failure                                        |

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

### API Validation Rules

- `company` and `role` required, max 200 chars
- `dateApplied` required, valid YYYY-MM-DD, not in future
- `status` must be valid enum value
- `rejection.reason` required when status is Rejected
- `jobPostingUrl` must be valid URL if provided
- `jobDescriptionText` max 50,000 chars
- `location.workMode` must be one of: Remote, Hybrid, Onsite (if provided)
- Interview `type` required, must be valid enum
- Interview `outcome` required, must be: Passed, Failed, Pending, Cancelled
- Interview `interviewers` max 500 chars
- Interview `notes` and `reflection` max 10,000 chars
- SAS token: 5-minute expiry, scoped to single blob, enforces 10 MB max
- File names must end in `.pdf`, `.docx`, or `.html` (JD only)

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
    "uploadUrl": "https://<storage>.blob.core.windows.net/resumes/abc-123/my-resume.pdf?sv=2021-06-08&se=2026-03-15T10:35:00Z&sr=b&sp=cw&sig=...",
    "blobPath": "resumes/abc-123/my-resume.pdf",
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
4. Event Grid triggers processUpload Function → updates Cosmos DB record
5. Frontend refreshes to see file linked

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

## Build Commands

```bash
# Frontend
cd client && npm install && npm run dev

# Backend (Azure Functions)
cd api && npm install && func start

# Deploy infrastructure
az deployment group create -g job-tracker-rg -f infra/main.bicep -p infra/parameters.json

# Deploy app (handled by GitHub Actions, but manual if needed)
swa deploy
```

## Project Structure

```
job-tracker/
├── .github/
│   ├── copilot-instructions.md
│   └── workflows/
│       └── azure-static-web-apps.yml
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
