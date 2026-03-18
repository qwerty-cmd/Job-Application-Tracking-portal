# Job Application Tracking Portal

## Architecture

```
Frontend:  React + TypeScript (Vite)
Backend:   Azure Functions (Node.js/TypeScript, Consumption plan)
Database:  Azure Cosmos DB (NoSQL API, free tier — 1000 RU/s, 25 GB)
Storage:   Azure Blob Storage (resumes & cover letters)
Events:    Azure Event Grid (blob upload → function trigger)
Hosting:   Azure Static Web Apps (free tier)
IaC:       Bicep
CI/CD:     GitHub Actions (auto via Azure SWA)
Auth:      Azure SWA built-in (GitHub provider)
```

## Current Status

- [x] Phase 0: Architecture & Design
- [ ] Phase 1: Infrastructure (Bicep)
- [ ] Phase 2: Backend API (CRUD Functions)
- [ ] Phase 3: Event Streaming Pipeline
- [ ] Phase 4: Frontend (React)
- [ ] Phase 5: CI/CD & Deployment
- [ ] Phase 6: Polish & Showcase-Ready

**Currently working on:** Phase 0 — planning complete, ready to start Phase 1

## Decisions Made

- Partition key: `/id`
- Blob path structure: `{containerName}/{applicationId}/{filename}`
- Blob containers: `resumes`, `coverletters`
- SAS token expiry: 5 minutes
- Auth: Azure SWA built-in GitHub provider (restrict to personal account)
- Cosmos DB client: singleton pattern in `api/shared/cosmosClient.ts`
- File uploads: direct browser → Blob via SAS token (never proxy through Functions)
- Soft delete vs hard delete: TBD

## Data Model (Cosmos DB)

```json
{
  "id": "uuid",
  "company": "string",
  "role": "string",
  "dateApplied": "YYYY-MM-DD",
  "outcome": "Applied | Phone Screen | Interview | Offer | Rejected | Withdrawn",
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
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

## API Endpoints

| Method | Route                  | Description                   |
| ------ | ---------------------- | ----------------------------- |
| GET    | /api/applications      | List all applications         |
| GET    | /api/applications/{id} | Get single application        |
| POST   | /api/applications      | Create new application        |
| PATCH  | /api/applications/{id} | Update application            |
| DELETE | /api/applications/{id} | Delete application            |
| POST   | /api/upload/sas-token  | Get SAS token for file upload |

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
