# Development Log

Session-by-session history of work done on the Job Application Tracking Portal.
Each entry records what was done, on which machine, with which AI tool, and what's next.

---

## 2026-03-18 — Work Laptop (GitHub Copilot)

**What was done:**

- Project architecture designed (Azure free tier: SWA + Functions + Cosmos DB + Blob + Event Grid)
- Created TIMELINE.md with full phase breakdown, effort estimates, and Gantt view
- Decided on context-sharing strategy: CLAUDE.md as single source of truth
- Created CLAUDE.md, .github/copilot-instructions.md, and this DEVLOG.md

**Decisions made:**

- Azure over AWS (familiarity, simpler architecture, permanent free tiers)
- React + TypeScript for frontend
- Node.js/TypeScript Azure Functions for backend
- Cosmos DB NoSQL with /id partition key
- Event Grid for blob upload event streaming
- Bicep for IaC

**Blockers:** None

**Next session:** Start Phase 1 — scaffold Bicep templates for all Azure resources
