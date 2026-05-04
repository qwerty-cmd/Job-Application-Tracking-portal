---
applyTo: "**"
---

# Job Application Tracking Portal — Copilot Context

**Read `docs/project/CLAUDE.md` for full project context.**

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

- `docs/project/DEVLOG.md` — detailed session-by-session work log
- `docs/project/TIMELINE.md` — project plan with phase breakdowns and effort estimates
- `docs/rca/` — root cause analysis writeups for bugs solved (read before debugging similar areas)

## Quick Reference

- **Frontend:** React + TypeScript (Vite) → `client/`
- **Backend:** Azure Functions (Node.js/TypeScript) → `api/`
- **Database:** Azure Cosmos DB (NoSQL, free tier)
- **Storage:** Azure Blob Storage (resumes, cover letters, job descriptions)
- **Events:** Azure Event Grid (blob upload triggers)
- **IaC:** Bicep → `infra/`
- **Hosting:** Azure Static Web Apps (free tier)

## Project Status

Phases 0–6 and V2 (public demo mode) are **complete and deployed**. Active work is **V3 PWA Mobile** on branch `feature/pwa-mobile` — see `docs/plans/v3-pwa-mobile-implementation-plan.md`.

## Custom Agents

**Backend (TDD workflow):**

- **`@test-writer`** — Writes failing tests from `docs/project/CLAUDE.md` specs (red phase)
- **`@implementer`** — Writes code to make tests pass (green phase)

**Frontend (build-first workflow):**

- **`@fe-builder`** — Builds React components from wireframes, wires API
- **`@fe-test-writer`** — Writes RTL + MSW tests **after** components are built
- **`@pwa-builder`** — V3 PWA + mobile-responsive work (manifest, service worker, mobile layouts)

**Cross-cutting:**

- **`@reviewer`** — Read-only security/consistency review (frontend or backend)

## Prompts

- **`/tdd-endpoint`** — Full TDD cycle for a single API endpoint
- **`/security-review`** — Full codebase security audit
- **`/rca`** — Root cause analysis writeup for a bug/incident in `docs/rca/`

## Scoped Instructions (auto-loaded)

- `api/**/*.ts` → API conventions (response shape, Cosmos patterns, validation)
- `api/**/*.test.ts` → Testing conventions (structure, naming, assertions)
- `infra/**/*.bicep` → Bicep conventions (resources, security, outputs)
- `client/**/*.tsx` → Frontend conventions (components, forms, state, API integration)
- `client/src/mocks/**` → MSW demo mode conventions (handler parity, auth/SW pitfalls)

## Environment Notes

- Windows + PowerShell — `rg` is not installed; use built-in tools (`grep_search`, `file_search`) or `Get-ChildItem | Select-String` for repo searches.
- Use `cd api && npm test` and `cd client && npm test` (Vitest) — do not run from repo root.
