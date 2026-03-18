# Job Application Tracking Portal — Solution Architecture & Timeline

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub (Personal)                        │
│                   Public Repo + GitHub Actions                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ CI/CD (auto-deploy on push)
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│              Azure Static Web Apps (Free Tier)                   │
│              React / Next.js SPA Frontend                        │
└──────────────────────────────┬──────────────────────────────────┘
                               │ API calls
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│              Azure Functions (Consumption Plan)                  │
│              REST API (CRUD + file upload trigger)               │
│              1M executions/month FREE                            │
└─────────┬──────────────────┬─────────────────┬─────────────────┘
          │                  │                 │
          ▼                  ▼                 ▼
┌──────────────┐  ┌──────────────────┐  ┌─────────────────────┐
│  Cosmos DB   │  │  Azure Blob      │  │  Azure Event Grid   │
│  (Free Tier) │  │  Storage         │  │  (Free: 100K        │
│  1000 RU/s   │  │  (Resumes &      │  │   ops/month)        │
│  25 GB       │  │  Cover Letters)  │  │                     │
└──────────────┘  └──────────────────┘  └─────────────────────┘
```

---

## Azure Services & Cost

| Service                   | Tier               | Always Free?                              | Purpose                                                                 |
| ------------------------- | ------------------ | ----------------------------------------- | ----------------------------------------------------------------------- |
| **Azure Static Web Apps** | Free               | ✅ Yes                                    | Hosts React frontend, built-in SSL, custom domain, GitHub Actions CI/CD |
| **Azure Functions**       | Consumption        | ✅ Yes (1M req/mo)                        | Backend REST API — CRUD, SAS token generation                           |
| **Azure Cosmos DB**       | Free Tier          | ✅ Yes (1000 RU/s, 25 GB)                 | Stores application records (NoSQL)                                      |
| **Azure Blob Storage**    | LRS                | ⚠️ 5 GB free 12 months, then ~$0.02/GB/mo | Stores resume PDFs and cover letters                                    |
| **Azure Event Grid**      | —                  | ✅ Yes (100K ops/mo)                      | Fires events on blob upload → triggers Function                         |
| **GitHub Actions**        | Free (public repo) | ✅ Yes                                    | CI/CD pipeline                                                          |

**Estimated monthly cost: $0** (within free tiers for single-user app)

---

## Tech Stack

| Layer           | Technology                                       | Rationale                                                      |
| --------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| Frontend        | React + TypeScript                               | Widely recognized, pairs natively with Azure Static Web Apps   |
| UI Library      | Tailwind CSS or Material UI                      | Clean, professional look with minimal effort                   |
| Backend         | Azure Functions (Node.js/TypeScript)             | Serverless, zero idle cost                                     |
| Database        | Azure Cosmos DB (NoSQL API)                      | Always-free tier, strong interview talking point               |
| File Storage    | Azure Blob Storage                               | Industry-standard object storage, direct upload via SAS tokens |
| Event Streaming | Azure Event Grid                                 | Blob upload → Event Grid → Azure Function                      |
| Auth            | Azure Static Web Apps built-in (GitHub provider) | Free, zero-config                                              |
| IaC             | Bicep                                            | First-party Azure IaC, concise syntax                          |

---

> **Note:** For the authoritative data model, API contract, and project structure, see `CLAUDE.md`. This file is for effort planning and timeline tracking only.

---

## Event Streaming Flow

```
User uploads file (resume, cover letter, or JD)
        │
        ▼
Frontend → Azure Function (gets SAS token) → Direct upload to Blob Storage
        │
        ▼
Blob Storage fires "BlobCreated" event → Azure Event Grid
        │
        ▼
Event Grid triggers Azure Function ("processUpload")
        │
        ▼
Function updates Cosmos DB record with blob URL, file name, timestamp
```

---

## Assumptions

| Factor                | Assumption                                        |
| --------------------- | ------------------------------------------------- |
| Effort type           | Side project (evenings/weekends) — ~8–10 hrs/week |
| Developer count       | 1                                                 |
| AI assistance         | GitHub Copilot (VS Code) + Claude Code            |
| Azure familiarity     | Intermediate                                      |
| React familiarity     | Intermediate                                      |
| Bicep/IaC familiarity | Beginner-to-intermediate                          |

---

## Phase 0: Architecture & Design

**Effort: ~8 hrs | Calendar: Week 1**

| Task                                                     | Effort | Notes                                                 |
| -------------------------------------------------------- | ------ | ----------------------------------------------------- |
| Finalize tech stack decisions                            | 2 hrs  | Confirm React vs Next.js, Node.js vs Python Functions |
| Define data model (Cosmos DB schema)                     | 2 hrs  | Partition key strategy, item structure                |
| Design REST API contract (endpoints, request/response)   | 3 hrs  | OpenAPI/Swagger spec recommended                      |
| Draw architecture diagram (publishable)                  | 2 hrs  | draw.io or Excalidraw — portfolio artifact            |
| Define file naming conventions, blob container structure | 1 hr   | e.g., `resumes/{applicationId}/{filename}`            |
| Create GitHub repo, branch strategy, README skeleton     | 1 hr   | `main` + `develop` branches                           |

---

## Phase 1: Infrastructure as Code (Bicep)

**Effort: 5–6 hrs | Calendar: Week 1**

| Task                                                    | Effort  | Notes                            |
| ------------------------------------------------------- | ------- | -------------------------------- |
| Write Bicep: Cosmos DB (free tier, database, container) | 1 hr    | Partition key, indexing policy   |
| Write Bicep: Storage Account + blob containers          | 0.5 hrs | CORS rules for browser uploads   |
| Write Bicep: Azure Functions (Consumption plan)         | 1 hr    | App settings, connection strings |
| Write Bicep: Azure Static Web Apps                      | 0.5 hrs | GitHub integration config        |
| Write Bicep: Event Grid subscription (blob → function)  | 1 hr    | Event filtering                  |
| Parameters file + deploy & validate                     | 1.5 hrs | Debug any ARM errors             |

---

## Phase 2: Backend API — CRUD (Azure Functions)

**Effort: 8–9 hrs | Calendar: Week 2**

| Task                                                  | Effort  | Notes                                                             |
| ----------------------------------------------------- | ------- | ----------------------------------------------------------------- |
| Scaffold Azure Functions project (Node.js/TypeScript) | 0.5 hrs | `func init`, project structure                                    |
| Cosmos DB SDK client (singleton pattern)              | 1 hr    | Connection, error handling, retry config                          |
| `createApplication` function (POST)                   | 1 hr    | Input validation, generate ID, write to Cosmos                    |
| `getApplications` function (GET all + GET by ID)      | 1 hr    | Query with pagination, point read                                 |
| `updateApplication` function (PATCH)                  | 0.5 hrs | Partial update, rejection validation                              |
| `deleteApplication` + `restoreApplication` functions  | 0.5 hrs | Soft delete + undelete                                            |
| `getUploadSasToken` + `getDownloadSasToken` functions | 1.5 hrs | Generate scoped SAS tokens for upload (write) and download (read) |
| Interview CRUD functions (add/update/delete/reorder)  | 1.5 hrs | Nested interview management within application                    |
| Dashboard stats endpoint                              | 1 hr    | Aggregate counts by status and interview type                     |
| Local testing with Functions Core Tools               | 1.5 hrs | End-to-end local validation                                       |

---

## Phase 3: Event Streaming Pipeline

**Effort: 5–6 hrs | Calendar: Week 2**

| Task                                                   | Effort  | Notes                                         |
| ------------------------------------------------------ | ------- | --------------------------------------------- |
| Configure Blob Storage event subscription → Event Grid | 1 hr    | Filter for `BlobCreated`, specific containers |
| Build `processUpload` function (Event Grid trigger)    | 1.5 hrs | Parse event payload, extract metadata         |
| Logic: link uploaded file to Cosmos DB record          | 1 hr    | Update record with blob URL, timestamp        |
| Error handling: dead-letter, retries                   | 1 hr    | Handle orphaned uploads                       |
| End-to-end testing                                     | 1.5 hrs | Upload → event fires → DB updated             |

---

## Phase 4: Frontend (React + TypeScript)

**Effort: 13–15 hrs | Calendar: Week 2–3**

| Task                                           | Effort  | Notes                                                             |
| ---------------------------------------------- | ------- | ----------------------------------------------------------------- |
| Scaffold React app (Vite + TypeScript)         | 0.5 hrs |                                                                   |
| Set up Tailwind CSS or Material UI             | 0.5 hrs |                                                                   |
| API service layer (axios/fetch wrapper, types) | 1 hr    |                                                                   |
| Dashboard page — table with all applications   | 2 hrs   | Sort, filter by outcome/date                                      |
| Add Application page — form with all fields    | 2 hrs   | Company, role, location, date, status, JD text/URL + file uploads |
| File upload component — drag & drop            | 2 hrs   | Get SAS token → upload to Blob → progress                         |
| Edit Application page                          | 1.5 hrs | Pre-populated form, file replacement                              |
| Application Detail page                        | 1.5 hrs | View all info, download files, interview list                     |
| Interview round management (add/edit/reorder)  | 2 hrs   | Nested UI within application detail                               |
| Navigation, layout, routing                    | 1 hr    | React Router                                                      |
| Responsive design + loading/error states       | 1.5 hrs |                                                                   |

---

## Phase 5: CI/CD & Deployment

**Effort: 3–4 hrs | Calendar: Week 3**

| Task                                   | Effort  | Notes                              |
| -------------------------------------- | ------- | ---------------------------------- |
| Connect repo to Azure Static Web Apps  | 0.5 hrs | Azure Portal or CLI                |
| Configure GitHub Actions workflow      | 1 hr    | Build paths, environment variables |
| First deployment + smoke test          | 1 hr    |                                    |
| Fix CORS, env vars, connection strings | 1 hr    | Common deployment issues           |
| Custom domain setup (optional)         | 0.5 hrs | DNS configuration                  |

---

## Phase 6: Polish & Showcase-Ready

**Effort: 7–8 hrs | Calendar: Week 3–4**

| Task                                                   | Effort  | Notes                                 |
| ------------------------------------------------------ | ------- | ------------------------------------- |
| Add GitHub auth (Static Web Apps built-in)             | 1.5 hrs | Restrict write access to your account |
| Activity/event log view per application                | 2 hrs   | Timeline of status changes, uploads   |
| README: architecture diagram, screenshots, setup guide | 2 hrs   | Portfolio-ready documentation         |
| Final UI polish, edge case fixes                       | 1.5 hrs |                                       |
| Security review (SAS token expiry, CORS, validation)   | 1.5 hrs |                                       |

---

## Summary Table

| Phase                          | Effort (hrs)   | Calendar (@ 8–10 hrs/week) |
| ------------------------------ | -------------- | -------------------------- |
| **0 — Architecture & Design**  | 8              | Week 1                     |
| **1 — Infrastructure (Bicep)** | 5–6            | Week 1                     |
| **2 — Backend API**            | 8–9            | Week 2                     |
| **3 — Event Streaming**        | 5–6            | Week 2                     |
| **4 — Frontend**               | 13–15          | Week 2–4                   |
| **5 — CI/CD & Deploy**         | 3–4            | Week 4                     |
| **6 — Polish & Showcase**      | 7–8            | Week 4–5                   |
| **Total**                      | **~53–62 hrs** | **~4–5 weeks**             |

> **If working full-time (~40 hrs/week): ~1.5–2 weeks**

---

## Gantt View (Part-Time, 8–10 hrs/week)

```
Week 1  ████████████████░░░░  Phase 0 (Design) + Phase 1 (Bicep)
Week 2  ████████████████░░░░  Phase 2 (API) + Phase 3 (Events) + Phase 4 start
Week 3  ████████████████░░░░  Phase 4 continued (Frontend)
Week 4  ████████████████░░░░  Phase 4 finish + Phase 5 (Deploy)
Week 5  ██████████░░░░░░░░░░  Phase 6 (Polish & Showcase-Ready)
```

---

## Critical Path & Dependencies

```
Phase 0 (Design)
   │
   ├──► Phase 1 (Infra) ──► Phase 2 (API) ──┬──► Phase 4 (Frontend) ──► Phase 5 (Deploy)
   │                           │              │                              │
   │                           └──► Phase 3 ──┘                              │
   │                                (Events)                                 │
   │                                                                         ▼
   └─────────────────────────────────────────────────────────────────► Phase 6 (Polish)
```

**Blockers to watch:**

- Phase 4 (Frontend) is the largest phase and sits on the critical path
- Phase 1 (Bicep) has the highest learning-curve risk if new to IaC
- Phase 3 (Events) is the riskiest technically but is off the critical path

---

## AI Tooling Split

| Task                                             | Best Tool             | Rationale                                         |
| ------------------------------------------------ | --------------------- | ------------------------------------------------- |
| Architecture decisions, data model, API contract | **Copilot (VS Code)** | Conversational planning, iterative design         |
| Generate full Bicep files                        | **Either**            | Both handle IaC well                              |
| Scaffold Azure Functions + all CRUD              | **Claude Code**       | Strong at full project generation from specs      |
| React components, pages, forms                   | **Claude Code**       | Excels at complete connected frontend in one pass |
| Debug deployment issues                          | **Copilot (VS Code)** | Sees terminal output and errors in real time      |
| Event Grid trigger function                      | **Either**            | Well-documented pattern                           |
| GitHub Actions workflow                          | **Copilot (VS Code)** | Generate directly in repo                         |
| Code review / explain generated code             | **Copilot (VS Code)** | Walks through code in editor context              |

---

## Key Interview Talking Points

1. **Every Bicep resource** — know what each property does
2. **Partition key choice** and Cosmos DB RU model
3. **Event-driven flow** end-to-end (upload → Event Grid → Function → DB update)
4. **SAS tokens** — why direct upload vs proxy upload
5. **CI/CD pipeline** — stages and trigger mechanisms
6. **Cost optimization** — why these free tiers were chosen

> AI builds it fast. **You** need to own it.

---

## Milestones

| Milestone                    | Deliverable                                                       |
| ---------------------------- | ----------------------------------------------------------------- |
| **M1** — Infra deployed      | All Azure resources defined as Bicep IaC and deployed             |
| **M2** — API working         | Serverless REST API with CRUD on Cosmos DB                        |
| **M3** — Event pipeline live | File uploads trigger event-driven pipeline via Event Grid         |
| **M4** — Frontend connected  | Full working app — add applications, upload files, track outcomes |
| **M5** — Live on Azure       | CI/CD from GitHub, auto-deploys, live public URL                  |
| **M6** — Showcase-ready      | Auth-protected, polished UI, documented, reproducible infra       |
