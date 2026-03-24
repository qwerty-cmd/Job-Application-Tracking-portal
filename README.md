# Job Application Tracking Portal

A full-stack, serverless job application tracker built on Azure — from infrastructure as code through CI/CD. Track applications, interviews, file uploads, and analytics in a single-page app deployed entirely on Azure's free tier.

---

## Architecture

```
                            +--------------------------+
                            |  Azure Static Web Apps   |
                            |  (React SPA + GitHub     |
                            |   OAuth)                 |
                            +----+----------+----------+
                                 |          |
                     REST API    |          |  Direct PUT
                     calls       |          |  via SAS token
                                 v          v
                 +---------------+--+  +----+-----------+
                 |  Azure Functions  |  | Azure Blob     |
                 |  (16 endpoints +  |  | Storage        |
                 |   Event Grid      |  | (resumes, CLs, |
                 |   trigger)        |  |  JDs)          |
                 +---+----------+----+  +----+-----------+
                     |          |            |
                     v          v            v
              +------+---+  +--+---+  +-----+----------+
              | Cosmos DB |  | SAS  |  | Event Grid     |
              | (NoSQL,   |  | token|  | (BlobCreated   |
              |  free     |  | gen  |  |  -> process-   |
              |  tier)    |  |      |  |  Upload)       |
              +-----------+  +------+  +----------------+
```

**All infrastructure provisioned via Bicep** (`infra/main.bicep`) — 16 Azure resources, zero portal clicks.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, Shadcn/UI, React Router 7, TanStack Table, dnd-kit |
| Backend | Azure Functions v4, Node.js 20, TypeScript |
| Database | Azure Cosmos DB (NoSQL, free tier) |
| File Storage | Azure Blob Storage with SAS token direct upload |
| Events | Azure Event Grid (BlobCreated triggers) |
| Auth | Azure SWA built-in GitHub OAuth + custom `owner` role |
| Infrastructure | Bicep (16 resources) |
| CI/CD | GitHub Actions (2 workflows: SWA + Functions) |
| Testing | Vitest (266 API tests + 57 frontend tests), React Testing Library, MSW |

**Estimated monthly cost: $0** (all services within Azure free tiers)

---

## Key Engineering Highlights

**Event-driven file processing** — Files upload directly from the browser to Blob Storage via short-lived SAS tokens (5 min, single-blob scope, create+write only). Event Grid fires a `BlobCreated` event that triggers `processUpload`, which validates file size, checks magic bytes (PDF/DOCX/HTML), implements "latest wins" for re-uploads, and is fully idempotent for Event Grid retries.

**Auth without a gateway** — SWA Free tier doesn't support linked backends, so every Function validates the `x-ms-client-principal` header and checks for the `owner` role via a shared `requireOwner()` helper. Same security outcome, zero extra cost.

**Embedded interviews with drag-and-drop** — Interviews are embedded in the application document (not separate Cosmos items). Each round has a display `order` field, reorderable via dnd-kit drag-and-drop in the UI, persisted via a PATCH reorder endpoint.

**Activity timeline** — Every mutation (status change, file upload, interview add/delete) appends an `ActivityEvent` to the document's `history` array, displayed as a vertical timeline on the detail page.

**Defence in depth on uploads** — Client-side extension/size check, SAS token scoped to single blob, `processUpload` validates magic bytes and file size server-side, 90-day lifecycle policy catches orphaned blobs.

---

## Features

- Create, edit, and soft-delete job applications with full undo/restore
- Status lifecycle tracking (Applying through Accepted/Rejected/Withdrawn)
- Interview round management with drag-and-drop reordering
- Direct file uploads (resume, cover letter, job description) via SAS tokens
- Dashboard with status distribution, interview pipeline, and dropoff analytics
- Activity log timeline per application
- GitHub OAuth with private owner-only access
- Responsive UI with Shadcn/UI components

---

## API Endpoints

16 REST endpoints + 1 Event Grid trigger, all returning `{ data, error }`:

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/applications` | List (paginated, filtered, sorted) |
| POST | `/api/applications` | Create |
| GET | `/api/applications/:id` | Full detail |
| PATCH | `/api/applications/:id` | Partial update |
| DELETE | `/api/applications/:id` | Soft delete |
| PATCH | `/api/applications/:id/restore` | Restore |
| GET | `/api/applications/deleted` | List soft-deleted |
| GET | `/api/applications/stats` | Dashboard analytics |
| POST | `/api/applications/:id/interviews` | Add interview |
| PATCH | `/api/applications/:id/interviews/:iid` | Update interview |
| DELETE | `/api/applications/:id/interviews/:iid` | Remove interview |
| PATCH | `/api/applications/:id/interviews/reorder` | Reorder interviews |
| POST | `/api/upload/sas-token` | Upload SAS token |
| GET | `/api/download/sas-token` | Download SAS token |
| DELETE | `/api/applications/:id/files/:fileType` | Delete file |
| — | `processUpload` (Event Grid) | Process uploaded blob |

---

## Project Structure

```
/
├── api/               Azure Functions backend (TypeScript, 16 endpoints)
│   ├── src/functions/  One directory per endpoint
│   └── src/shared/     Auth, Cosmos client, validation, response helpers
├── client/            React frontend (TypeScript + Vite)
│   ├── src/pages/      5 pages (Dashboard, Applications, Detail, Deleted, Login)
│   ├── src/components/ 19 components (Shadcn/UI + custom)
│   ├── src/hooks/      Custom React hooks (mutations, data fetching)
│   └── src/mocks/      MSW handlers for dev/test
├── infra/             Bicep IaC (main.bicep + parameters.json)
├── docs/              Design docs, reviews, plans, RCAs
│   ├── project/        CLAUDE.md (source of truth), DEVLOG, TIMELINE
│   ├── reviews/        Phase-by-phase code review findings
│   └── plans/          CI/CD and deployment plans
├── .github/
│   ├── workflows/      2 CI/CD workflows (SWA + Functions)
│   └── instructions/   Coding conventions
└── postman/           API test collections
```

---

## Local Development

**Prerequisites:** Node.js 20+, npm, Azure Functions Core Tools v4

```bash
# Frontend only (MSW mocks the API)
cd client && npm install && npm run dev

# Frontend + real Functions backend
# (requires local.settings.json with Cosmos/Storage keys)
cd api && npm install && npm run build
swa start live-api

# Run all tests
cd api && npm test        # 266 backend tests
cd client && npm test     # 56 frontend tests
```

See [docs/guides/development-modes.md](docs/guides/development-modes.md) for detailed setup.

---

## CI/CD

Two GitHub Actions workflows deploy on push to `main`:

- **`azure-static-web-apps.yml`** — Frontend: test, build, deploy to SWA
- **`azure-functions.yml`** — Backend: test, build, deploy to Function App

Both include quality gates (lint + test + build) that must pass before deploy. Deploy jobs are gated to `main` only.

---

## Infrastructure (Bicep)

All 16 Azure resources defined in [`infra/main.bicep`](infra/main.bicep):

Cosmos DB (free tier) | Storage Account + 4 blob containers | Function App (Consumption) | Static Web App (free) | Event Grid system topic + subscription | App Service Plan | Log Analytics + App Insights

Deploy with:

```bash
az deployment group create -g job-tracker-rg -f infra/main.bicep -p infra/parameters.json
```

---

## Testing

| Suite | Tests | Coverage |
|-------|-------|----------|
| API (Vitest) | 266 | All 16 endpoints + processUpload, auth, validation |
| Frontend (Vitest + RTL + MSW) | 57 | Pages, components, auth flows, form validation |

Tests run in CI before every deploy. API tests mock Cosmos and Storage. Frontend tests use MSW for network-level mocking.

---

## Phase Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Architecture & Design | Complete |
| 1 | Infrastructure (Bicep) | Complete — 16 resources deployed |
| 2 | Backend API | Complete — 266 tests |
| 3 | Event Streaming Pipeline | Complete — E2E verified |
| 4 | Frontend (React) | Complete — 56 tests |
| 5 | CI/CD & Deployment | Complete — both workflows live |
| 6 | Polish & Showcase | Complete |

---

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/project/CLAUDE.md](docs/project/CLAUDE.md) | Source of truth — architecture, data model, API contract, all decisions |
| [docs/project/DEVLOG.md](docs/project/DEVLOG.md) | Session-by-session development history |
| [docs/project/TIMELINE.md](docs/project/TIMELINE.md) | Phase planning and effort estimates |
| [docs/reviews/](docs/reviews/) | Code review findings per phase |
| [docs/plans/](docs/plans/) | CI/CD and deployment plans |
