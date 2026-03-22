# Job Application Tracking Portal — Solution Design Document

> **Purpose:** End-to-end technical handover document covering architecture, data modelling, API contracts, and all system flows.
> **Audience:** Developers, reviewers, or anyone picking up this project.
> **Source of truth for implementation detail:** `docs/project/CLAUDE.md` (this document provides a high-level overview).

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Azure Services & Cost](#3-azure-services--cost)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [Data Model](#5-data-model)
6. [Application Status Flow](#6-application-status-flow)
7. [API Contract](#7-api-contract)
8. [File Upload Flow](#8-file-upload-flow)
9. [File Download Flow](#9-file-download-flow)
10. [Event-Driven Pipeline](#10-event-driven-pipeline)
11. [File Re-Upload & Race Condition Handling](#11-file-re-upload--race-condition-handling)
12. [Soft Delete & Restore Flow](#12-soft-delete--restore-flow)
13. [Interview Management Flow](#13-interview-management-flow)
14. [Dashboard & Analytics Flow](#14-dashboard--analytics-flow)
15. [Infrastructure as Code](#15-infrastructure-as-code)
16. [Project Structure](#16-project-structure)
17. [Security Summary](#17-security-summary)
18. [v2 Roadmap](#18-v2-roadmap)

---

## 1. Overview

A personal job application tracking portal built on Azure's free tier. Tracks applications end-to-end — from initial "Applying" status through interview rounds to final outcome (Accepted / Rejected / Withdrawn). Includes file management for resumes, cover letters, and job descriptions, and a dashboard for analytics.

**Key characteristics:**

- Single-user, private app (owner-only access)
- Serverless, zero idle cost
- Event-driven file processing
- Soft delete with undo capability
- Designed for AI integration in v2

---

## 2. System Architecture

### High-Level Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         GitHub Repository                        │
│                    Public Repo + GitHub Actions                   │
└──────────────────────────────┬───────────────────────────────────┘
                               │ CI/CD (auto-deploy on push)
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│               Azure Static Web Apps (Free Tier)                  │
│          React + TypeScript (Vite) SPA Frontend                  │
│          Built-in Auth (GitHub provider, owner role)              │
│          Route authorization gateway (401/403)                   │
└───────────────────┬────────────────────┬────────────────────────┘
                    │ API proxy          │ Direct blob upload
                    ▼                    ▼
┌──────────────────────────┐   ┌──────────────────────────────────┐
│   Azure Functions        │   │   Azure Blob Storage (LRS)       │
│   (Consumption Plan)     │   │                                  │
│                          │   │   Containers:                    │
│   REST API endpoints     │   │   ├── resumes/                   │
│   processUpload trigger  │   │   ├── coverletters/              │
│   SAS token generation   │   │   ├── jobdescriptions/           │
│                          │   │   └── deadletter/                │
└───────────┬──────────────┘   └──────────┬───────────────────────┘
            │                             │
            │ CRUD                        │ BlobCreated event
            ▼                             ▼
┌──────────────────────────┐   ┌──────────────────────────────────┐
│   Azure Cosmos DB        │   │   Azure Event Grid               │
│   (Free Tier)            │   │                                  │
│                          │   │   System Topic (Blob Storage)    │
│   NoSQL API              │   │   Event Grid Schema              │
│   1000 RU/s, 25 GB       │   │   BlobCreated filter             │
│   Partition key: /id     │   │   Dead-letter → deadletter/      │
│                          │   │                                  │
│   Container:             │   │   Subscription → processUpload   │
│   └── applications       │   │   (Function Event Grid trigger)  │
└──────────────────────────┘   └──────────────────────────────────┘
```

### Component Responsibilities

| Component                 | Responsibility                                                                    |
| ------------------------- | --------------------------------------------------------------------------------- |
| **Azure Static Web Apps** | Hosts SPA, built-in auth (GitHub provider), serves `x-ms-client-principal` header |
| **Azure Functions**       | REST API (CRUD), SAS token generation, `processUpload` event handler              |
| **Azure Cosmos DB**       | Stores all application data as JSON documents                                     |
| **Azure Blob Storage**    | Stores uploaded files (resumes, cover letters, job descriptions)                  |
| **Azure Event Grid**      | Routes `BlobCreated` events from Storage to `processUpload` Function              |
| **GitHub Actions**        | CI/CD pipeline, auto-triggered by Azure SWA on push                               |

### Tech Stack

| Layer           | Technology                             |
| --------------- | -------------------------------------- |
| Frontend        | React + TypeScript (Vite)              |
| Backend         | Azure Functions (Node.js / TypeScript) |
| Database        | Azure Cosmos DB (NoSQL API)            |
| File Storage    | Azure Blob Storage                     |
| Event Streaming | Azure Event Grid                       |
| Auth            | Azure SWA built-in (GitHub provider)   |
| IaC             | Bicep                                  |
| CI/CD           | GitHub Actions                         |

---

## 3. Azure Services & Cost

| Service               | Tier               | Free?                  | Purpose                                   |
| --------------------- | ------------------ | ---------------------- | ----------------------------------------- |
| Azure Static Web Apps | Free               | Yes                    | Frontend hosting, auth gateway, API proxy |
| Azure Functions       | Consumption        | Yes (1M req/mo)        | Backend API + event triggers              |
| Azure Cosmos DB       | Free Tier          | Yes (1000 RU/s, 25 GB) | Application data store                    |
| Azure Blob Storage    | LRS                | 5 GB free 12 months    | File storage                              |
| Azure Event Grid      | —                  | Yes (100K ops/mo)      | Blob upload event routing                 |
| GitHub Actions        | Free (public repo) | Yes                    | CI/CD pipeline                            |

**Estimated monthly cost: $0** (within free tiers for single-user usage)

---

## 4. Authentication & Authorization

### Flow Diagram

```
User (Browser)
      │
      ▼
┌─────────────────────────────────────────┐
│        Azure Static Web Apps            │
│                                         │
│  Built-in GitHub auth provider          │
│  Sets x-ms-client-principal header      │
│  on authenticated requests              │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│        Azure Functions API              │
│                                         │
│  requireOwner() helper on every endpoint│
│  1. No principal header? → 401          │
│  2. Missing 'owner' role? → 403         │
│  3. Has 'owner' role? → ✅ Allow        │
└─────────────────────────────────────────┘
```

> **Note:** SWA Free tier does not support linked backends, so the SWA gateway cannot enforce `/api/*` route rules against the external Function App. Auth is enforced inside each Function via a shared `requireOwner()` helper that validates the `x-ms-client-principal` header.

### Key Decisions

- **Provider:** GitHub (SWA built-in — no custom identity plumbing)
- **Access model:** Private app — all routes (frontend + `/api/*`) require custom `owner` role
- **Roles:** `anonymous`, `authenticated` (SWA built-in) + `owner` (custom, assigned to one GitHub account)
- **Enforcement:** Each Function validates the `x-ms-client-principal` header via `requireOwner()` helper — returns 401 (missing/invalid session) or 403 (missing `owner` role)
- **API identity:** SWA-managed session + `x-ms-client-principal` header
- **No API keys, no custom JWT, no API Management in v1**
- **Rate limiting:** Targeted in-function throttling for sensitive endpoints (SAS token issuance/download)

---

## 5. Data Model

### Cosmos DB Configuration

| Setting       | Value                                   |
| ------------- | --------------------------------------- |
| API           | NoSQL                                   |
| Database      | `jobtracker`                            |
| Container     | `applications`                          |
| Partition Key | `/id`                                   |
| Tier          | Free (1000 RU/s, 25 GB)                 |
| Deletion      | Soft delete (`isDeleted` + `deletedAt`) |

### Why Partition Key `/id`?

- High cardinality (every application has a unique ID)
- No hot partitions
- Cheapest possible point reads (1 RU per read)
- Applications are always accessed individually, not by company

### Document Schema

```json
{
  "id": "uuid",
  "company": "string (required, max 200)",
  "role": "string (required, max 200)",
  "location": {
    "city": "string",
    "country": "string",
    "workMode": "Remote | Hybrid | Onsite",
    "other": "string | null"
  },
  "dateApplied": "YYYY-MM-DD (required, not in future)",
  "jobPostingUrl": "string | null (valid URL)",
  "jobDescriptionText": "string | null (max 50,000 chars)",
  "jobDescriptionFile": {
    "blobUrl": "string (internal only — never returned in API)",
    "fileName": "string",
    "uploadedAt": "ISO 8601"
  },
  "status": "Applying | Application Submitted | Recruiter Screening | Interview Stage | Pending Offer | Accepted | Rejected | Withdrawn",
  "resume": {
    "blobUrl": "string (internal only)",
    "fileName": "string",
    "uploadedAt": "ISO 8601"
  },
  "coverLetter": {
    "blobUrl": "string (internal only)",
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
      "interviewers": "string (max 500)",
      "notes": "string (max 10,000)",
      "reflection": "string (max 10,000)",
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

### Entity Relationship Diagram

```
┌──────────────────────────────────────────────┐
│               Application                    │
│──────────────────────────────────────────────│
│  id (PK)            : uuid                   │
│  company            : string                 │
│  role               : string                 │
│  location           : Location (embedded)    │
│  dateApplied        : date                   │
│  status             : StatusEnum             │
│  jobPostingUrl      : string?                │
│  jobDescriptionText : string?                │
│  jobDescriptionFile : FileRef? (embedded)    │
│  resume             : FileRef? (embedded)    │
│  coverLetter        : FileRef? (embedded)    │
│  rejection          : Rejection? (embedded)  │
│  interviews[]       : Interview[] (embedded) │
│  isDeleted          : boolean                │
│  deletedAt          : datetime?              │
│  createdAt          : datetime               │
│  updatedAt          : datetime               │
├──────────────────────────────────────────────┤
│                                              │
│  ┌─────────────────┐  ┌──────────────────┐   │
│  │   Location      │  │   FileRef        │   │
│  │─────────────────│  │──────────────────│   │
│  │  city           │  │  blobUrl         │   │
│  │  country        │  │  fileName        │   │
│  │  workMode       │  │  uploadedAt      │   │
│  │  other          │  └──────────────────┘   │
│  └─────────────────┘                         │
│                                              │
│  ┌─────────────────┐  ┌──────────────────┐   │
│  │  Rejection      │  │   Interview      │   │
│  │─────────────────│  │──────────────────│   │
│  │  reason         │  │  id              │   │
│  │  notes          │  │  round           │   │
│  └─────────────────┘  │  type            │   │
│                        │  date            │   │
│                        │  interviewers    │   │
│                        │  notes           │   │
│                        │  reflection      │   │
│                        │  outcome         │   │
│                        │  order           │   │
│                        └──────────────────┘   │
└──────────────────────────────────────────────┘
```

**Why embedded (not separate documents)?** Interviews are always viewed in the context of an application. A single application will have at most ~10 rounds, keeping it well under Cosmos DB's 2 MB document limit. One read (1 RU) gets everything.

---

## 6. Application Status Flow

```
                    ┌──────────┐
                    │ Applying │ (initial status on create)
                    └────┬─────┘
                         │ user submits
                         ▼
               ┌─────────────────────┐
               │ Application         │
               │ Submitted           │
               └────────┬────────────┘
                        │ recruiter responds
                        ▼
               ┌─────────────────────┐        ┌───────────┐
               │ Recruiter           │───────►│ Withdrawn │ (user pulls out
               │ Screening           │        └───────────┘  at any stage)
               └────────┬────────────┘              ▲
                        │ scheduled                  │
                        ▼                            │
               ┌─────────────────────┐               │
               │ Interview Stage     │◄──── auto-set when first
               │                     │      interview is added
               └────────┬────────────┘
                        │
                ┌───────┴───────┐
                ▼               ▼
       ┌──────────────┐  ┌───────────┐
       │ Pending Offer│  │ Rejected  │ ← requires rejection.reason
       └──────┬───────┘  └───────────┘
              │
              ▼
       ┌──────────────┐
       │  Accepted    │
       └──────────────┘
```

### Rejection Reasons (enum)

| Value               | Meaning                                |
| ------------------- | -------------------------------------- |
| `Ghosted`           | No response after reasonable time      |
| `Failed Technical`  | Didn't pass technical interview        |
| `Failed Behavioral` | Didn't pass behavioral interview       |
| `Overqualified`     | Told you're overqualified              |
| `Underqualified`    | Told you're underqualified             |
| `Salary Mismatch`   | Compensation expectations didn't align |
| `Position Filled`   | Role filled by another candidate       |
| `Company Freeze`    | Hiring freeze or role cancelled        |
| `Other`             | Free text via `rejection.notes`        |

---

## 7. API Contract

### Overview

All endpoints are prefixed with `/api/` and proxied through Azure Static Web Apps.

**Universal response shape:**

```json
{ "data": { ... }, "error": null }         // Success
{ "data": null, "error": { "code": "...", "message": "...", "details": [...] } }  // Error
```

### Endpoint Summary

| Method   | Route                                           | Description                                     | Status        |
| -------- | ----------------------------------------------- | ----------------------------------------------- | ------------- |
| `GET`    | `/api/applications`                             | List applications (filtered, sorted, paginated) | 200           |
| `GET`    | `/api/applications/:id`                         | Get full application detail                     | 200, 404      |
| `POST`   | `/api/applications`                             | Create new application                          | 201, 400      |
| `PATCH`  | `/api/applications/:id`                         | Partial update                                  | 200, 400, 404 |
| `DELETE` | `/api/applications/:id`                         | Soft delete                                     | 200, 404      |
| `PATCH`  | `/api/applications/:id/restore`                 | Restore soft-deleted                            | 200, 404      |
| `POST`   | `/api/applications/:id/interviews`              | Add interview round                             | 201, 400, 404 |
| `PATCH`  | `/api/applications/:id/interviews/:interviewId` | Update interview                                | 200, 400, 404 |
| `DELETE` | `/api/applications/:id/interviews/:interviewId` | Remove interview                                | 200, 404      |
| `PATCH`  | `/api/applications/:id/interviews/reorder`      | Reorder interviews                              | 200, 400, 404 |
| `POST`   | `/api/upload/sas-token`                         | Get upload SAS token                            | 200, 400, 404 |
| `GET`    | `/api/download/sas-token`                       | Get download SAS token                          | 200, 404      |
| `GET`    | `/api/applications/stats`                       | Dashboard statistics                            | 200           |
| `GET`    | `/api/applications/deleted`                     | List deleted applications                       | 200           |
| `DELETE` | `/api/applications/:id/files/:fileType`         | Delete uploaded file                            | 200, 404      |

### HTTP Status Codes

| Code | Meaning                | When                                       |
| ---- | ---------------------- | ------------------------------------------ |
| 200  | OK                     | Successful GET, PATCH, DELETE              |
| 201  | Created                | Successful POST                            |
| 400  | Bad Request            | Validation failed                          |
| 401  | Unauthorized           | No valid session (Function auth guard)     |
| 403  | Forbidden              | Missing `owner` role (Function auth guard) |
| 404  | Not Found              | ID doesn't exist or is soft-deleted        |
| 413  | Payload Too Large      | File > 10 MB                               |
| 415  | Unsupported Media Type | Invalid file type                          |
| 500  | Internal Server Error  | Unexpected failure                         |

### Validation Rules

| Field                           | Rule                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `company`                       | Required, max 200 chars                                                                                                                                 |
| `role`                          | Required, max 200 chars                                                                                                                                 |
| `dateApplied`                   | Required, YYYY-MM-DD, not in future                                                                                                                     |
| `status`                        | Valid enum value                                                                                                                                        |
| `rejection.reason`              | Required when status = Rejected                                                                                                                         |
| `jobPostingUrl`                 | Valid URL if provided                                                                                                                                   |
| `jobDescriptionText`            | Max 50,000 chars                                                                                                                                        |
| `location.workMode`             | Remote, Hybrid, or Onsite                                                                                                                               |
| Interview `type`                | Required, valid enum                                                                                                                                    |
| Interview `date`                | Required, YYYY-MM-DD (future allowed)                                                                                                                   |
| Interview `outcome`             | Required: Passed, Failed, Pending, Cancelled                                                                                                            |
| Interview `interviewers`        | Max 500 chars                                                                                                                                           |
| Interview `notes`, `reflection` | Max 10,000 chars each                                                                                                                                   |
| File name                       | Must end in `.pdf`, `.docx`, or `.html` (JD only)                                                                                                       |
| File size                       | Max 10 MB                                                                                                                                               |
| `contentType`                   | Must match extension (`.pdf`→`application/pdf`, `.docx`→`application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `.html`→`text/html`) |

### Query Parameters (GET /api/applications)

| Param         | Description                                     | Default       |
| ------------- | ----------------------------------------------- | ------------- |
| `status`      | Filter by status enum                           | —             |
| `from` / `to` | Filter by date applied range (YYYY-MM-DD)       | —             |
| `sortBy`      | `dateApplied`, `company`, `status`, `updatedAt` | `dateApplied` |
| `sortOrder`   | `asc`, `desc`                                   | `desc`        |
| `page`        | Page number                                     | 1             |
| `pageSize`    | Items per page (max 100)                        | 20            |

> Free-text search by company/role is deferred to v2.

### Key Endpoint Details

#### List Applications (GET /api/applications)

Returns **summary** items — no interview details, no JD text, no blob URLs. Includes boolean flags (`hasResume`, `hasCoverLetter`, `hasJobDescription`) and `interviewCount`. Paginated with `totalItems` and `totalPages`.

#### Get Application (GET /api/applications/:id)

Returns the **full document** — all fields including interviews array, JD text, file metadata (`fileName`, `uploadedAt`). Note: `blobUrl` is never returned in API responses. Use the download SAS token endpoint instead.

#### Create Application (POST /api/applications)

Accepts: `company`, `role`, `location`, `dateApplied`, `status`, `jobPostingUrl`, `jobDescriptionText`. Files are NOT uploaded here — create first, then upload via SAS token. Returns the full document with generated `id`, timestamps, empty `interviews[]`, and null file fields.

#### Update Application (PATCH /api/applications/:id)

Send only changed fields. If status is set to `Rejected`, `rejection.reason` must be provided or already exist. Returns full updated document.

#### Add Interview (POST /api/applications/:id/interviews)

Auto-generates `id`, sets `round` and `order` to next sequential number. **If status is before "Interview Stage", auto-updates to "Interview Stage".** Returns full updated application.

#### Reorder Interviews (PATCH /api/applications/:id/interviews/reorder)

Accepts `{ "order": ["id-2", "id-1", "id-3"] }`. All interview IDs must be present (no partial reorder). Updates `order` field on each interview.

---

## 8. File Upload Flow

### Supported Files

| File Type       | Allowed Extensions       | Max Size |
| --------------- | ------------------------ | -------- |
| Resume          | `.pdf`, `.docx`          | 10 MB    |
| Cover Letter    | `.pdf`, `.docx`          | 10 MB    |
| Job Description | `.pdf`, `.docx`, `.html` | 10 MB    |

### Upload Sequence Diagram

```
 Browser                    Functions API              Blob Storage           Event Grid          processUpload
    │                            │                         │                     │                     │
    │ 1. Validate file           │                         │                     │                     │
    │    (extension + size)      │                         │                     │                     │
    │                            │                         │                     │                     │
    │ 2. POST /upload/sas-token  │                         │                     │                     │
    │   {applicationId,          │                         │                     │                     │
    │    fileType, fileName,     │                         │                     │                     │
    │    contentType}            │                         │                     │                     │
    │ ─────────────────────────► │                         │                     │                     │
    │                            │ Validate:               │                     │                     │
    │                            │  - app exists in Cosmos │                     │                     │
    │                            │  - fileType valid enum  │                     │                     │
    │                            │  - extension allowed    │                     │                     │
    │                            │  - contentType matches  │                     │                     │
    │                            │                         │                     │                     │
    │ ◄───────────────────────── │                         │                     │                     │
    │    {uploadUrl, blobPath,   │                         │                     │                     │
    │     expiresAt}             │                         │                     │                     │
    │                            │                         │                     │                     │
    │ 3. Record timestamp        │                         │                     │                     │
    │    (for polling later)     │                         │                     │                     │
    │                            │                         │                     │                     │
    │ 4. PUT file directly ──────────────────────────────► │                     │                     │
    │    (XHR for progress bar)  │                         │                     │                     │
    │    Headers:                │                         │                     │                     │
    │    x-ms-blob-type:         │                         │                     │                     │
    │      BlockBlob             │                         │                     │                     │
    │    Content-Type:           │                         │                     │                     │
    │      application/pdf       │                         │                     │                     │
    │                            │                         │                     │                     │
    │                            │                         │ 5. BlobCreated ────►│                     │
    │                            │                         │    event             │                     │
    │                            │                         │                     │ 6. Trigger ────────►│
    │                            │                         │                     │                     │
    │                            │                         │                     │          a. Check size ≤ 10 MB
    │                            │                         │                     │          b. Validate magic bytes
    │                            │                         │                     │          c. Read Cosmos record
    │                            │                         │                     │          d. Check not soft-deleted
    │                            │                         │                     │          e. Compare timestamps
    │                            │                         │                     │          f. Update Cosmos
    │                            │                         │                     │          g. Delete old blob (if any)
    │                            │                         │                     │                     │
    │ 7. Poll GET /:id           │                         │                     │                     │
    │    every 2s (max 15s)      │                         │                     │                     │
    │    until uploadedAt >      │                         │                     │                     │
    │    recorded timestamp      │                         │                     │                     │
    │ ─────────────────────────► │                         │                     │                     │
    │ ◄───────────────────────── │                         │                     │                     │
    │    ✅ File linked!         │                         │                     │                     │
```

### SAS Token Properties

| Property    | Upload                              | Download    |
| ----------- | ----------------------------------- | ----------- |
| Expiry      | 5 minutes                           | 5 minutes   |
| Permissions | Create + Write                      | Read only   |
| Scope       | Single blob                         | Single blob |
| Max size    | 10 MB (`Content-Length` constraint) | —           |

### Blob Path Structure

```
{container}/{applicationId}/{timestamp}-{filename}
```

Example: `resumes/abc-123/1710498900000-my-resume.pdf`

Timestamp prevents collisions on re-upload and enables "latest wins" logic.

---

## 9. File Download Flow

```
 Browser                    Functions API              Blob Storage
    │                            │                         │
    │ GET /download/sas-token    │                         │
    │  ?applicationId=abc-123    │                         │
    │  &fileType=resume          │                         │
    │ ─────────────────────────► │                         │
    │                            │ Read Cosmos record      │
    │                            │ Get blobUrl for fileType│
    │                            │ Generate read-only SAS  │
    │ ◄───────────────────────── │                         │
    │  {downloadUrl, fileName,   │                         │
    │   expiresAt}               │                         │
    │                            │                         │
    │ GET downloadUrl ─────────────────────────────────────►
    │ ◄───────────────────────────────────────────────────
    │    (file bytes)            │                         │
```

---

## 10. Event-Driven Pipeline

### Architecture

```
Blob Storage ──► Event Grid System Topic ──► Event Grid Subscription ──► processUpload (Function)
                                                      │
                                                      │ (on failure after 30 retries / 24hr)
                                                      ▼
                                              deadletter container
```

### Configuration

| Setting            | Value                                             |
| ------------------ | ------------------------------------------------- |
| Topic type         | System topic (from Blob Storage)                  |
| Event schema       | Event Grid Schema                                 |
| Event filter       | `Microsoft.Storage.BlobCreated` only              |
| Subscription count | 1 (single subscription for all upload containers) |
| Trigger binding    | Azure Function Event Grid trigger                 |
| Retry policy       | Default: 30 attempts, 24-hour TTL                 |
| Dead-letter        | `deadletter` blob container                       |

### processUpload Logic (Step by Step)

```
BlobCreated Event Received
         │
         ▼
    ┌────────────┐     ┌──────────────────┐
    │ Size check │────►│ > 10 MB?         │──── Yes ──► Delete blob, EXIT
    │ (blob)     │     │                  │
    └────────────┘     └──────┬───────────┘
                              │ No
                              ▼
    ┌────────────┐     ┌──────────────────┐
    │ Magic bytes│────►│ Content mismatch?│──── Yes ──► Delete blob, EXIT (415)
    │ validation │     │ PDF=%PDF         │
    │            │     │ DOCX=PK (ZIP)    │
    │            │     │ HTML=<!DOCTYPE   │
    └────────────┘     └──────┬───────────┘
                              │ No
                              ▼
    ┌────────────┐     ┌──────────────────┐
    │ Read Cosmos│────►│ App soft-deleted?│──── Yes ──► Skip, EXIT (orphan → lifecycle)
    │ record     │     │ (isDeleted=true) │
    └────────────┘     └──────┬───────────┘
                              │ No
                              ▼
    ┌────────────┐     ┌──────────────────┐
    │ Compare    │────►│ Blob older than  │──── Yes ──► Skip (older upload lost race)
    │ timestamps │     │ Cosmos uploadedAt│
    └────────────┘     └──────┬───────────┘
                              │ No (blob is newer)
                              ▼
    ┌──────────────────────────────────┐
    │ Update Cosmos with new metadata  │
    │ Delete old blob (if exists)      │ ← "not found" = success (idempotent)
    │ (blobUrl, fileName, uploadedAt)  │
    └──────────────────────────────────┘
```

### Idempotency Guarantees

- Event Grid may deliver the same event multiple times on retry
- "Blob not found" on old blob deletion = success (already cleaned up)
- "Latest wins" timestamp check prevents stale events from overwriting newer data
- Orphaned blobs caught by 90-day lifecycle policy

---

## 11. File Re-Upload & Race Condition Handling

### Re-Upload Flow

```
1. User uploads resume v2 for application abc-123
2. SAS token generates path: resumes/abc-123/1710499000000-resume-v2.pdf
3. Browser PUTs to Blob Storage
4. BlobCreated event fires
5. processUpload:
   a. Reads Cosmos → finds existing resume (v1, uploaded at timestamp T1)
   b. New blob timestamp T2 > T1 → proceed
   c. Updates Cosmos with v2 metadata (blobUrl, fileName, uploadedAt = T2)
   d. Deletes old v1 blob from storage
```

### Race Condition: Concurrent Uploads of Same File Type

```
User uploads resume v2 AND resume v3 almost simultaneously

Timeline:
  T1: v2 blob created → BlobCreated event queued
  T2: v3 blob created → BlobCreated event queued (T2 > T1)

If v3 event processes first:
  - Cosmos updated to v3 (uploadedAt = T2)
  - Old blob deleted

Then v2 event processes:
  - Reads Cosmos → uploadedAt is T2
  - v2 timestamp T1 < T2 → SKIP (older upload lost the race)
  - v2 blob left for lifecycle policy cleanup (90 days)

Result: Cosmos always reflects the latest upload. No data loss.
```

---

## 12. Soft Delete & Restore Flow

```
Active Application
       │
       │ DELETE /api/applications/:id
       ▼
┌──────────────────────────────────────┐
│  isDeleted = true                    │
│  deletedAt = "2026-03-19T09:00:00Z"  │
│                                      │
│  - Excluded from GET /applications   │
│  - Excluded from GET /stats          │
│  - Visible in GET /applications/     │
│    deleted                           │
│  - Blob files NOT deleted            │
│  - processUpload skips new uploads   │
└──────────────────┬───────────────────┘
                   │
                   │ PATCH /api/applications/:id/restore
                   ▼
          Active Application
          (isDeleted = false, deletedAt = null)
```

---

## 13. Interview Management Flow

```
Application (any status)
       │
       │ POST /api/applications/:id/interviews
       │ {type, date, interviewers, notes, reflection, outcome}
       ▼
┌──────────────────────────────────────┐
│  Interview added:                    │
│  - id: auto-generated UUID          │
│  - round: next sequential number    │
│  - order: same as round             │
│                                      │
│  If status < "Interview Stage":     │
│    → auto-update to "Interview Stage"│
└──────────────────┬───────────────────┘
                   │
     ┌─────────────┼──────────────┐
     ▼             ▼              ▼
  PATCH          DELETE        PATCH
  (update)     (remove)      (reorder)
     │             │              │
     │             │              │ {order: [id2, id1, id3]}
     │             │              │ updates 'order' field
     │             │              │ on each interview
     │             ▼              │
     │  Remaining rounds         │
     │  renumbered sequentially  │
     │                           │
     └───────────┬───────────────┘
                 ▼
         updatedAt refreshed
         on parent application
```

### Interview Types (enum)

| Value            | Description                         |
| ---------------- | ----------------------------------- |
| `Phone Screen`   | Initial phone/video screening       |
| `Technical`      | Technical or coding interview       |
| `Behavioral`     | Behavioral or fit interview         |
| `Case Study`     | Business case or scenario interview |
| `Panel`          | Multi-interviewer panel             |
| `Take Home Test` | Take-home assignment                |
| `Other`          | Anything else                       |

### Interview Outcomes (enum)

`Passed` | `Failed` | `Pending` | `Cancelled`

---

## 14. Dashboard & Analytics Flow

```
GET /api/applications/stats?from=2026-03-01&to=2026-03-31
                │
                ▼
    ┌───────────────────────────────────────┐
    │ Query Cosmos DB:                      │
    │   WHERE isDeleted = false             │
    │   AND dateApplied >= from             │
    │   AND dateApplied <= to               │
    │                                       │
    │ Aggregate:                            │
    │   - Count per status                  │
    │   - Count interviews per type         │
    │   - Total applications                │
    │   - Total interviews                  │
    └───────────────────────────────────────┘
                │
                ▼
    Response:
    {
      period: { from, to },
      totalApplications: 47,
      byStatus: { Applying: 3, "Application Submitted": 12, ... },
      totalInterviews: 18,
      interviewsByType: { Phone Screen: 8, Technical: 5, ... }
    }
```

**Defaults:** `from` = first day of current month, `to` = today.
**Soft-deleted applications are always excluded from all stats.**

---

## 15. Infrastructure as Code

### Bicep Structure

```
infra/
├── main.bicep          ← Entrypoint (orchestrates all modules)
└── parameters.json     ← Environment-specific values
```

### Resources Provisioned

| Resource                    | Key Configuration                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Cosmos DB**               | Free tier, database `jobtracker`, container `applications`, partition key `/id`                                                 |
| **Storage Account**         | LRS, 4 containers (`resumes`, `coverletters`, `jobdescriptions`, `deadletter`), CORS (SWA origin only), 90-day lifecycle policy |
| **Function App**            | Consumption plan, Node.js runtime, connection strings via app settings                                                          |
| **Static Web App**          | Free tier, GitHub repo integration, route rules (`owner` role required)                                                         |
| **Event Grid System Topic** | Source: Storage Account                                                                                                         |
| **Event Grid Subscription** | Filter: `Microsoft.Storage.BlobCreated`, dead-letter: `deadletter` container                                                    |

### Required Outputs

| Output               | Purpose                        |
| -------------------- | ------------------------------ |
| SWA hostname         | Frontend URL for testing       |
| Function app name    | API endpoint for configuration |
| Cosmos DB endpoint   | SDK connection                 |
| Storage account name | SAS token generation           |

### Deployment

```bash
az deployment group create \
  -g job-tracker-rg \
  -f infra/main.bicep \
  -p infra/parameters.json
```

---

## 16. Project Structure

```
job-tracker/
├── .github/
│   ├── copilot-instructions.md          ← Copilot workspace context
│   ├── agents/
│   │   ├── test-writer.agent.md         ← TDD: writes failing tests
│   │   ├── implementer.agent.md         ← TDD: implements code
│   │   └── reviewer.agent.md            ← Security & consistency review
│   ├── prompts/
│   │   ├── tdd-endpoint.prompt.md       ← Full TDD cycle for one endpoint
│   │   └── security-review.prompt.md    ← Codebase security audit
│   ├── instructions/
│   │   ├── api-conventions.instructions.md
│   │   ├── testing.instructions.md
│   │   └── bicep.instructions.md
│   └── workflows/                        ← CI/CD pipeline files (Phase 5)
├── infra/
│   ├── main.bicep                       ← IaC entrypoint
│   └── parameters.json                  ← Environment config
├── api/
│   ├── functions/                       ← Azure Function handlers
│   ├── shared/
│   │   └── cosmosClient.ts              ← Singleton Cosmos DB client
│   ├── package.json
│   └── host.json
├── client/
│   ├── src/                             ← React SPA source
│   ├── public/
│   └── package.json
├── CLAUDE.md                            ← Source of truth (implementation detail)
├── SOLUTION.md                          ← This document (overview)
├── DEVLOG.md                            ← Session-by-session work log
└── TIMELINE.md                          ← Effort estimates & timeline
```

---

## 17. Security Summary

| Layer                 | Control                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Auth**              | SWA built-in GitHub provider, custom `owner` role                                                          |
| **Authorization**     | Each Function enforces 401/403 via `requireOwner()` helper (SWA Free tier has no linked backend)           |
| **API**               | Input validation, enum enforcement, field length limits, field whitelisting on PATCH                       |
| **SAS tokens**        | 5-minute expiry, single-blob scope, minimal permissions                                                    |
| **File validation**   | Client-side (extension + size) → processUpload (magic bytes + size) — SAS has no Content-Length constraint |
| **CORS**              | Blob Storage allows only SWA origin, `PUT`/`GET`/`HEAD` methods                                            |
| **Secrets**           | Environment variables (`COSMOS_*`, `STORAGE_*`), never in code                                             |
| **Data integrity**    | Soft delete (no permanent loss), Cosmos write before blob delete                                           |
| **Orphan cleanup**    | 90-day lifecycle policy on Blob Storage                                                                    |
| **Event reliability** | Event Grid retries (30 attempts, 24hr TTL) + dead-letter container                                         |

---

## 18. v2 Roadmap

| Feature                     | Description                                                   |
| --------------------------- | ------------------------------------------------------------- |
| **AI Diagnosis of Failure** | Analyse rejection patterns, resume fit, interview performance |
| **Interview AI Feedback**   | AI rates interview reflections, gives improvement suggestions |
| **Free-text Search**        | Search applications by company/role                           |

The `reflection` field on interviews is included in v1 specifically to capture data for v2 AI analysis without backfilling.

---

_Document version: 2026-03-22 | Generated from CLAUDE.md (source of truth)_
