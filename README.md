# Job Application Tracking Portal

A full-stack app to track job applications, interviews, documents, and status analytics.

## Tech Stack

- Frontend: React + TypeScript + Vite (`client/`)
- Backend: Azure Functions (Node.js + TypeScript) (`api/`)
- Database: Azure Cosmos DB (NoSQL)
- File Storage: Azure Blob Storage
- Eventing: Azure Event Grid
- Infrastructure: Bicep (`infra/`)
- Hosting: Azure Static Web Apps + Azure Functions

## Quick Start (Local)

### 1) Frontend

```bash
cd client
npm install
npm run dev
```

### 2) API

```bash
cd api
npm install
npm run build
```

To run the Functions host locally in watch mode, use the VS Code task `func: host start`.

## Project Directory Structure

```
job-application-tracking-portal/
├── .github/
│   ├── copilot-instructions.md        ← START HERE for AI agents: architecture, tech stack, workflow
│   ├── instructions/                  ← Coding conventions for specific file types
│   │   ├── api-conventions.instructions.md    (Azure Functions API patterns)
│   │   ├── bicep.instructions.md               (Infrastructure naming and structure)
│   │   └── testing.instructions.md             (Test patterns and TDD approach)
│   ├── agents/                        ← AI agent definitions (test-writer, implementer, reviewer, etc.)
│   └── workflows/                     ← GitHub Actions CI/CD pipelines
│       └── azure-static-web-apps.yml
│
├── api/                               ← Azure Functions backend (Node.js + TypeScript)
│   ├── src/
│   │   ├── index.ts                           (Function registry entry point)
│   │   ├── functions/                         (16 API endpoints + processUpload trigger)
│   │   │   ├── createApplication/
│   │   │   ├── getApplication/
│   │   │   ├── listApplications/
│   │   │   ├── updateApplication/
│   │   │   ├── deleteApplication/
│   │   │   ├── restoreApplication/
│   │   │   ├── listDeleted/
│   │   │   ├── getStats/
│   │   │   ├── addInterview/
│   │   │   ├── updateInterview/
│   │   │   ├── deleteInterview/
│   │   │   ├── reorderInterviews/
│   │   │   ├── uploadSasToken/
│   │   │   ├── downloadSasToken/
│   │   │   ├── deleteFile/
│   │   │   └── processUpload/                 (Event Grid trigger for blob uploads)
│   │   └── shared/                            (Backend utilities and singletons)
│   │       ├── auth.ts                        (requireOwner() role validation)
│   │       ├── cosmosClient.ts                (Singleton Cosmos DB client)
│   │       ├── storageClient.ts               (Singleton Azure Blob Storage client)
│   │       ├── response.ts                    (Consistent { data, error } envelope)
│   │       ├── logger.ts                      (Logging and telemetry)
│   │       ├── types.ts                       (Domain types, enums, constants)
│   │       ├── validation.ts                  (Request body validators)
│   │       └── telemetry.ts                   (Application Insights integration)
│   ├── host.json                              (Functions runtime config)
│   ├── local.settings.json                    (Local dev env vars: Cosmos, Storage keys)
│   ├── openapi.yaml                           (API contract/specification)
│   ├── package.json                           (Dependencies, build scripts)
│   ├── tsconfig.json                          (TypeScript config)
│   ├── vitest.config.ts                       (Test runner config)
│   └── Vitest test files (.test.ts)           (266 tests covering all endpoints)
│
├── client/                            ← React frontend (TypeScript + Vite)
│   ├── src/
│   │   ├── main.tsx                           (App entry, MSW setup for dev mode)
│   │   ├── App.tsx                            (Route and auth layout)
│   │   ├── components/
│   │   │   ├── ApplicationsTable.tsx           (Main list view, Excel-style table)
│   │   │   ├── CreateApplicationModal.tsx     (Form to create new application)
│   │   │   ├── DetailFields.tsx               (Application detail display)
│   │   │   ├── DetailHeader.tsx               (Header with status + rejection)
│   │   │   ├── DropoffChart.tsx               (Where applications stall/end)
│   │   │   ├── InterviewChart.tsx             (Interview pipeline progression)
│   │   │   ├── InterviewList.tsx              (Nested interview rounds)
│   │   │   ├── InterviewModal.tsx             (Add/edit interview dialog)
│   │   │   ├── FileSection.tsx                (Upload/download files UI)
│   │   │   ├── StatusChart.tsx                (Count per status stage)
│   │   │   ├── SummaryCards.tsx               (KPI cards for dashboard)
│   │   │   ├── FilterBar.tsx                  (Time period + view filters)
│   │   │   ├── NavBar.tsx                     (Header with auth logout)
│   │   │   ├── ProtectedRoute.tsx             (Role-based route guard)
│   │   │   ├── ErrorBoundary.tsx              (Error recovery)
│   │   │   ├── StatusBadge.tsx                (Color-coded status indicator)
│   │   │   └── ui/                            (Shadcn/ui + Radix components)
│   │   ├── pages/                             (Page components)
│   │   ├── hooks/                             (Custom React hooks)
│   │   ├── contexts/                          (React context providers)
│   │   ├── lib/                               (Utilities: API client, formatting)
│   │   ├── types/                             (TypeScript domain types)
│   │   ├── mocks/                             (MSW handlers for dev/test)
│   │   │   ├── handlers.ts                    (Mock API responses for all endpoints)
│   │   │   ├── browser.ts                     (MSW browser worker)
│   │   │   └── server.ts                      (MSW Node server for Vitest)
│   │   └── *.test.tsx                         (35+ component/integration tests)
│   ├── public/
│   │   ├── mockServiceWorker.js               (MSW service worker)
│   │   └── staticwebapp.config.json           (SWA routing and auth config)
│   ├── index.html                             (HTML entry point)
│   ├── package.json                           (Dependencies, build scripts)
│   ├── vite.config.ts                         (Vite bundler config)
│   ├── vitest.config.ts                       (Test runner config)
│   └── tsconfig.json                          (TypeScript config)
│
├── infra/                             ← Infrastructure as Code (Bicep)
│   ├── main.bicep                             (Main template, all 16 Azure resources)
│   └── parameters.json                        (Env-specific param values)
│
├── postman/                           ← API test collections
│   ├── job-application-tracker-api.postman_collection.json
│   ├── job-tracker-azure.postman_environment.json
│   ├── job-tracker-local.postman_environment.json
│   └── README.md                              (Postman collection guide)
│
├── docs/
│   ├── project/
│   │   ├── CLAUDE.md                          ⭐ SOURCE OF TRUTH: Design decisions, data model, API contract, every detail
│   │   ├── SOLUTION.md                        High-level solution overview
│   │   ├── DEVLOG.md                          Session-by-session work log
│   │   ├── TIMELINE.md                        Project phases and effort estimates
│   │   └── WORKFLOW.md                        TDD workflow and AI agent playbook
│   ├── guides/
│   │   ├── development-modes.md               Local vs live backend vs production modes
│   │   ├── frontend-workflow.md               Frontend build and component patterns
│   │   ├── rebuild-parity-master-prompt.md    📋 HANDOFF: Copy/paste prompt for new dev/AI rebuild
│   │   └── setup-for-ai-rebuild.md            🤖 AI AGENTS: Pre-work, env setup, conversation flow
│   ├── plans/
│   │   ├── phase-5-cicd-deployment-plan.md   CI/CD rollout checklist
│   │   ├── cicd-secrets-checklist.md          GitHub Actions secrets config
│   │   └── logging-improvement-plan.md        Logging roadmap
│   ├── reviews/
│   │   ├── phase-2-code-review.md             Backend security and quality findings
│   │   ├── phase-3-deployment-challenges.md   Event pipeline deployment notes
│   │   └── phase-4-frontend-review.md         Frontend accessibility and test fixes
│   ├── rca/
│   │   └── filter-bar-not-working.md          Root cause analysis examples
│   ├── wireframes/
│   │   └── phase-4-wireframes.md              UI/UX designs for dashboard and forms
│   └── README.md                              Docs navigation index
│
├── .github/ (repeated for clarity)
│   └── copilot-instructions.md                ⭐ Quick reference for AI agents
│
├── swa-cli.config.json                        SWA CLI config for local dev
├── package.json                               (Root workspace config if monorepo)
└── README.md                                  ← You are here
```

### Key Files at a Glance

| File/Folder                                   | Purpose                                                              | For Whom                          |
| --------------------------------------------- | -------------------------------------------------------------------- | --------------------------------- |
| `.github/copilot-instructions.md`             | Project context hub (architecture, tech, status, workflow)           | AI agents, new devs               |
| `docs/project/CLAUDE.md`                      | Source of truth for design, data model, API contract, every decision | Developers, reviewers             |
| `docs/guides/rebuild-parity-master-prompt.md` | Copy/paste prompt to rebuild project with exact parity               | New devs, AI agents               |
| `docs/guides/setup-for-ai-rebuild.md`         | Pre-work checklist, env setup, AI conversation flow                  | Anyone handing off to Claude/AI   |
| `.github/instructions/`                       | Coding conventions for API, Bicep, and tests                         | Developers following TDD          |
| `docs/project/DEVLOG.md`                      | Session history—what was built when and why                          | Context recovery between sessions |
| `api/local.settings.json`                     | Local dev secrets (Cosmos key, Storage key)                          | Backend developers                |
| `infra/main.bicep`                            | All 16 Azure resources (Cosmos, Functions, Storage, Event Grid, SWA) | DevOps, infrastructure review     |

## Testing

### Frontend

```bash
cd client
npm test
```

### API

```bash
cd api
npm test
```

## Documentation Map

### Getting Started (Read First)

1. **`.github/copilot-instructions.md`** — Quick overview: architecture, tech stack, current status, quick reference
2. **`docs/project/CLAUDE.md`** — Source of truth: design decisions, data model, API contract, implementation details
3. **`docs/project/SOLUTION.md`** — High-level solution overview: system architecture, services, flows

### For Developers

- **`docs/guides/development-modes.md`** — Setup instructions for local dev, live API, and production
- **`docs/guides/frontend-workflow.md`** — Frontend build patterns, component structure, workflow tips
- **`.github/instructions/`** — Coding conventions files:
  - `api-conventions.instructions.md` — Response shapes, Cosmos patterns, error handling
  - `bicep.instructions.md` — Infrastructure resource naming, structure, outputs
  - `testing.instructions.md` — Test patterns, TDD approach, naming conventions

### For Handoff & AI Agents

- **`docs/guides/rebuild-parity-master-prompt.md`** — 📋 Copy/paste prompt for exact project rebuild
- **`docs/guides/setup-for-ai-rebuild.md`** — 🤖 Pre-work checklist, env setup, AI conversation flow examples

### Project Planning & Tracking

- **`docs/project/DEVLOG.md`** — Session-by-session work log and progress history
- **`docs/project/TIMELINE.md`** — Project phases, effort estimates, current phase status
- **`docs/project/WORKFLOW.md`** — AI workflow playbook and TDD pattern documentation

### Deployment & CI/CD

- **`docs/plans/phase-5-cicd-deployment-plan.md`** — CI/CD rollout checklist and step-by-step guide
- **`docs/plans/cicd-secrets-checklist.md`** — GitHub Actions secrets configuration
- **`.github/workflows/azure-static-web-apps.yml`** — Automated SWA deploy workflow
- **`docs/plans/logging-improvement-plan.md`** — Observability and logging roadmap

### Code Review & Quality

- **`docs/reviews/phase-2-code-review.md`** — Backend security and quality findings
- **`docs/reviews/phase-3-deployment-challenges.md`** — Event pipeline deployment notes
- **`docs/reviews/phase-4-frontend-review.md`** — Frontend accessibility, testing notes, fixes

### Reference & Design

- **`docs/rca/`** — Root cause analysis examples and incident logs
- **`docs/wireframes/`** — UI/UX designs for dashboard, forms, and data displays
- **`postman/`** — API test collections and environment configs

## Current Status

- [x] Phase 1: Infrastructure (Bicep) — deployed
- [x] Phase 2: Backend API (CRUD + processUpload) — 266 tests passing
- [x] Phase 3: Event Pipeline (Event Grid) — deployed and verified
- [x] Phase 4: Frontend (React UI) — 35+ tests passing, complete
- [ ] Phase 5: CI/CD & Deployment — in progress
- [ ] Phase 6: Polish & Showcase

**Next Step:** See `docs/plans/phase-5-cicd-deployment-plan.md` for CI/CD rollout checklist.
