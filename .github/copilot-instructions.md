---
applyTo: '**'
---

# Job Application Tracking Portal — Copilot Context

**Read `CLAUDE.md` in the repo root for full project context.**

That file is the single source of truth and contains:
- Architecture & tech stack
- Current progress (phase checklist)
- Data model (Cosmos DB schema)
- API endpoint contract
- Build commands
- Project structure
- Coding conventions
- Decisions log

Also available:
- `DEVLOG.md` — detailed session-by-session work log
- `TIMELINE.md` — project plan with phase breakdowns and effort estimates

## Quick Reference

- **Frontend:** React + TypeScript (Vite) → `client/`
- **Backend:** Azure Functions (Node.js/TypeScript) → `api/`
- **Database:** Azure Cosmos DB (NoSQL, free tier)
- **Storage:** Azure Blob Storage (resumes, cover letters)
- **Events:** Azure Event Grid (blob upload triggers)
- **IaC:** Bicep → `infra/`
- **Hosting:** Azure Static Web Apps (free tier)
