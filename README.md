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

- Project source of truth: `docs/project/CLAUDE.md`
- Session log: `docs/project/DEVLOG.md`
- Timeline and estimates: `docs/project/TIMELINE.md`
- High-level solution: `docs/project/SOLUTION.md`
- AI workflow playbook: `docs/project/WORKFLOW.md`

- Deployment and environments: `docs/guides/development-modes.md`
- CI/CD deployment plan: `docs/plans/phase-5-cicd-deployment-plan.md`
- CI/CD secrets checklist: `docs/plans/cicd-secrets-checklist.md`
- CI/CD workflow: `.github/workflows/azure-static-web-apps.yml`
- Frontend workflow: `docs/guides/frontend-workflow.md`
- Logging plan: `docs/plans/logging-improvement-plan.md`
- Reviews: `docs/reviews/`
- Wireframes: `docs/wireframes/`

## Current Focus

Deployment and CI/CD to `main`.

Use `docs/plans/phase-5-cicd-deployment-plan.md` as the execution checklist.
