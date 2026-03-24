# Job Application Portal — Claude Code Context

This file is the starting point for Claude Code. Read it at the start of every session.

---

## What This Project Is

A full-stack, single-user job application tracking SPA deployed on Azure (all free-tier services). Built as a portfolio/learning project. The user tracks job applications end-to-end: status lifecycle, interview rounds, file uploads (resume/cover letter/JD), and a dashboard with analytics.

---

## Project Status

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Architecture & Design | ✅ Complete |
| 1 | Infrastructure (Bicep — 16 Azure resources) | ✅ Complete (deployed) |
| 2 | Backend API (16 endpoints + processUpload trigger) | ✅ Complete (266 tests) |
| 3 | Event Streaming Pipeline (Event Grid) | ✅ Complete (deployed, E2E verified) |
| 4 | Frontend (React — dashboard, interviews, files) | ✅ Complete (35+ tests) |
| 5 | CI/CD & Deployment (GitHub Actions) | ✅ Complete |
| 6 | Polish & Showcase | 🔄 In Progress |

**Currently on:** Phase 6 — Polish & Showcase. Both CI/CD workflows are live and smoke-tested. A route conflict bug was fixed post-deploy (`getApplication` route constrained to `{id:guid}` to prevent capturing literal paths `stats` and `deleted`).

---

## Directory Map

```
/
├── api/               Azure Functions backend (TypeScript)
│   ├── src/           Function handlers (one file per endpoint)
│   ├── shared/        Shared helpers: cosmosClient.ts, auth.ts, validation.ts
│   └── host.json      Functions runtime config
├── client/            React frontend (TypeScript + Vite)
│   ├── src/
│   │   ├── pages/     ApplicationsPage, ApplicationDetailPage, DashboardPage, DeletedApplicationsPage, LoginPage
│   │   ├── components/ Feature + UI components (Shadcn/Radix)
│   │   ├── hooks/     Custom React hooks
│   │   ├── api/       API client functions
│   │   └── types/     Shared TypeScript types
│   └── public/staticwebapp.config.json  SWA routing + auth config
├── infra/             Bicep IaC (main.bicep + parameters.json)
├── docs/
│   ├── project/       CLAUDE.md (full spec), DEVLOG.md, TIMELINE.md, WORKFLOW.md
│   ├── plans/         Phase plans, secrets checklist
│   ├── guides/        Dev mode guides
│   └── reviews/       Code review logs per phase
├── .github/
│   ├── workflows/     azure-static-web-apps.yml, azure-functions.yml
│   ├── agents/        Copilot custom agents (test-writer, implementer, reviewer, etc.)
│   ├── instructions/  Scoped coding conventions (api, testing, bicep)
│   └── prompts/       Reusable prompts (tdd-endpoint, security-review)
├── postman/           API test collections
└── swa-cli.config.json  Local dev: "mock" (MSW) and "live-api" (real Functions) modes
```

---

## Tech Stack at a Glance

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, TailwindCSS 4, Shadcn/UI, React Router 7, React Hook Form + Zod, TanStack Table, dnd-kit |
| Backend | Azure Functions v4, Node.js 20, TypeScript |
| Database | Azure Cosmos DB (NoSQL, free tier) — DB: `jobtracker`, Container: `applications`, Partition key: `/id` |
| Storage | Azure Blob Storage — containers: `resumes`, `coverletters`, `jobdescriptions`, `deadletter` |
| Events | Azure Event Grid (BlobCreated → `processUpload` Function) |
| Hosting | Azure Static Web Apps (free tier, GitHub OAuth) |
| IaC | Bicep (`infra/main.bicep`) |
| CI/CD | GitHub Actions (2 workflows) |
| Testing | Vitest (both API and frontend), React Testing Library, MSW |

---

## Key Architectural Decisions (non-obvious ones)

1. **No linked backend** — SWA Free tier doesn't support it. Frontend calls the Function App URL directly. The `swaLinkedBackend` Bicep resource was removed after it caused a deployment failure.

2. **Auth enforced at Function level** — SWA can't enforce `/api/*` route rules without a linked backend. Every Function reads `x-ms-client-principal`, decodes it, and checks for the `owner` role via `api/shared/auth.ts → requireOwner()`.

3. **Direct browser → Blob upload** — Files never proxy through Functions. Frontend gets a 5-minute SAS token (create+write, single blob), then PUTs directly to Blob Storage. Functions only generate/manage tokens.

4. **Timestamped blob paths** — `{container}/{applicationId}/{timestamp}-{filename}`. Prevents collision on re-upload and enables "latest wins" logic in `processUpload`.

5. **Polling for upload completion** — Frontend records `Date.now()` before the PUT, then polls `GET /:id` every 2 seconds (max 15s) until `uploadedAt` is newer than that timestamp. No WebSockets/SignalR needed.

6. **Interviews embedded in application document** — Not separate Cosmos documents. Always viewed in context, max ~10 per app, keeps reads cheap (1 RU).

7. **PATCH not PUT** — All updates are partial. `rejection.reason` is required in the same PATCH call if `status` is being set to `Rejected`.

8. **`blobUrl` never returned in GET responses** — Fetched on-demand via the download SAS endpoint to prevent stale URLs.

9. **`processUpload` is idempotent** — Event Grid may retry. "Blob not found" on old blob deletion is treated as success. Magic-byte validation runs before any Cosmos write.

---

## API Summary

All endpoints require the `x-ms-client-principal` header (owner role). Response shape is always `{ data, error }`.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/applications` | List (paginated, filtered, sorted) — summary only |
| POST | `/api/applications` | Create |
| GET | `/api/applications/:id` | Full detail (interviews, files — no blobUrls) |
| PATCH | `/api/applications/:id` | Partial update |
| DELETE | `/api/applications/:id` | Soft delete |
| PATCH | `/api/applications/:id/restore` | Restore soft-deleted |
| GET | `/api/applications/deleted` | List soft-deleted |
| POST | `/api/applications/:id/interviews` | Add interview round |
| PATCH | `/api/applications/:id/interviews/:interviewId` | Update interview |
| DELETE | `/api/applications/:id/interviews/:interviewId` | Delete interview |
| PATCH | `/api/applications/:id/interviews/reorder` | Reorder interviews |
| POST | `/api/upload/sas-token` | Get upload SAS token |
| GET | `/api/download/sas-token` | Get download SAS token |
| DELETE | `/api/applications/:id/files/:fileType` | Delete a file |
| GET | `/api/applications/stats` | Dashboard stats |

---

## Cosmos DB Document Shape (abbreviated)

```json
{
  "id": "uuid",
  "company": "string",
  "role": "string",
  "location": { "city": "", "country": "", "workMode": "Remote|Hybrid|Onsite", "other": null },
  "dateApplied": "YYYY-MM-DD",
  "status": "Applying|Application Submitted|Recruiter Screening|Interview Stage|Pending Offer|Accepted|Rejected|Withdrawn",
  "jobPostingUrl": null,
  "jobDescriptionText": null,
  "jobDescriptionFile": { "blobUrl": "", "fileName": "", "uploadedAt": "" },
  "resume": { "blobUrl": "", "fileName": "", "uploadedAt": "" },
  "coverLetter": { "blobUrl": "", "fileName": "", "uploadedAt": "" },
  "rejection": { "reason": "Ghosted|Failed Technical|...|Other", "notes": "" },
  "interviews": [{ "id": "uuid", "round": 1, "type": "...", "date": "", "outcome": "Passed|Failed|Pending|Cancelled", "order": 1 }],
  "isDeleted": false,
  "deletedAt": null,
  "createdAt": "",
  "updatedAt": ""
}
```

---

## Coding Conventions

**API (see `.github/instructions/api-conventions.instructions.md` for full detail):**
- Response: always `{ data: T | null, error: ErrorBody | null }`
- Auth check first in every handler — call `requireOwner(req)`, return early on 401/403
- Cosmos singleton: import from `api/shared/cosmosClient.ts`
- Validation before any DB/storage call
- Use `PATCH` routes for updates, not `PUT`

**Testing (see `.github/instructions/testing.instructions.md`):**
- TDD: tests first, implementation second
- All new API functions need a `.test.ts` alongside
- API tests mock Cosmos and Storage clients (Vitest `vi.mock`)
- Frontend tests use MSW for network-level API mocking
- Run API tests: `cd api && npm test`
- Run frontend tests: `cd client && npm test`

**Bicep (see `.github/instructions/bicep.instructions.md`):**
- All infrastructure in `infra/main.bicep`
- Parameters in `infra/parameters.json`
- CORS, event filters, dead-letter routing all managed in IaC

---

## Local Development

```bash
# Frontend only (MSW mocks API)
swa start mock

# Frontend + local Functions emulator
swa start live-api

# Run API tests
cd api && npm test

# Run frontend tests
cd client && npm test

# Build frontend
cd client && npm run build

# Build API (TypeScript compile)
cd api && npm run build
```

---

## CI/CD Workflows

**`.github/workflows/azure-static-web-apps.yml`** — Frontend
- Triggers: push to main, PR to main, manual dispatch
- Jobs: quality-gates (test + build) → deploy (main only)
- Secrets needed: `AZURE_STATIC_WEB_APPS_API_TOKEN`, `VITE_API_URL`, `VITE_APPINSIGHTS_CONNECTION_STRING`

**`.github/workflows/azure-functions.yml`** — Backend
- Triggers: push to main (api/ changes), PR to main (api/ changes), manual dispatch
- Jobs: quality-gates (test + build + prune) → deploy (main only)
- Secrets needed: `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`
- Pre-deploy: validates `WEBSITE_RUN_FROM_PACKAGE` setting compatibility

---

## Where to Find More

| Topic | File |
|-------|------|
| Full project spec, data model, API shapes, rationale | `docs/project/CLAUDE.md` |
| Session-by-session work history | `docs/project/DEVLOG.md` |
| Phase plan with effort estimates | `docs/project/TIMELINE.md` |
| TDD workflow & agent playbook | `docs/project/WORKFLOW.md` |
| API coding conventions | `.github/instructions/api-conventions.instructions.md` |
| Test conventions | `.github/instructions/testing.instructions.md` |
| Bicep conventions | `.github/instructions/bicep.instructions.md` |
| CI/CD secrets checklist | `docs/plans/cicd-secrets-checklist.md` |
| Phase 5 deployment plan | `docs/plans/phase-5-cicd-deployment-plan.md` |
