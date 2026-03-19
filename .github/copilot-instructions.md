---
applyTo: "**"
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
- **Storage:** Azure Blob Storage (resumes, cover letters, job descriptions)
- **Events:** Azure Event Grid (blob upload triggers)
- **IaC:** Bicep → `infra/`
- **Hosting:** Azure Static Web Apps (free tier)

## TDD Workflow

This project follows test-driven development. Use the custom agents:

- **`@test-writer`** — Writes failing tests from CLAUDE.md specs (red phase)
- **`@implementer`** — Writes code to make tests pass (green phase)
- **`@reviewer`** — Read-only security and consistency review

Use the prompt files:

- **`/tdd-endpoint`** — Full TDD cycle for a single API endpoint
- **`/security-review`** — Full codebase security audit

## Scoped Instructions (auto-loaded)

- `api/**/*.ts` → API conventions (response shape, Cosmos patterns, validation)
- `api/**/*.test.ts` → Testing conventions (structure, naming, assertions)
- `infra/**/*.bicep` → Bicep conventions (resources, security, outputs)
