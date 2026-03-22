# Rebuild With Exact Parity - Master Prompt

Use this prompt when handing the project to a new developer or a new AI coding agent.
Goal: rebuild the current system with behavior parity, not redesign.

## How To Use

1. Replace values in ALL CAPS placeholders.
2. Paste the full prompt into your AI tool or hand it to a developer.
3. Require the deliverables and parity checklist exactly as written.
4. **If handing to an AI agent (Claude, etc.):** First read `docs/guides/setup-for-ai-rebuild.md` for environment setup, how to provide context, and example conversation flow.

## Master Prompt (Copy/Paste)

PROJECT: Job Application Tracking Portal
REPOSITORY: OWNER/REPO
BRANCH TO MATCH: main
TARGET: Recreate current behavior exactly from documentation and repository structure.

You are tasked with rebuilding this project with exact functional parity.
Do not redesign architecture, data model, auth model, API shape, or workflow behavior unless explicitly told.

Read these docs first, in this order:

1. `.github/copilot-instructions.md` — **START HERE** — Project context, tech stack, TDD workflow, and quick reference
2. docs/project/CLAUDE.md
3. docs/project/SOLUTION.md
4. README.md
5. docs/guides/development-modes.md
6. docs/plans/cicd-secrets-checklist.md
7. api/openapi.yaml
8. postman/job-application-tracker-api.postman_collection.json

**Mandatory Instruction Files (apply these patterns throughout):**

- `.github/instructions/api-conventions.instructions.md` — Use when writing/modifying any Azure Functions API code (response shape, Cosmos patterns, validation, error handling)
- `.github/instructions/bicep.instructions.md` — Use when writing/modifying infrastructure templates (naming, resources, outputs)
- `.github/instructions/testing.instructions.md` — Use when writing test files (patterns, naming, TDD approach)

**If you are an AI agent:** This project provides specialized agents for different workflow phases:

**Backend API:**

- Use `@test-writer` to write failing tests from API contract specs (red phase)
- Use `@implementer` to implement the code (green phase)
- Use `@reviewer` to audit code for security, edge cases, and design fit

**Frontend:**

- Use `@fe-builder` to build React components visually (build-first)
- Use `@fe-test-writer` to write component and integration tests (after build)
- Use `@reviewer` to audit code for security and design compliance

**Security & Code Quality:**

- Use `@reviewer` for comprehensive security audit and OWASP checks
- Reference `/security-review` prompt file for full codebase security audit workflow

**Utilities:**

- Use `@Explore` for fast read-only codebase exploration and Q&A

**Specialized Workflows:**

- Reference `/tdd-endpoint` prompt file for full TDD cycle on a single API endpoint (test → implement → review in one flow)

Invoke them by name in your prompts (e.g., "Ask @test-writer to write tests for...").

Non-negotiable constraints:

1. Keep the same architecture pattern (React frontend, Azure Functions backend, Cosmos DB, Blob Storage, Event Grid, Bicep IaC, SWA auth model).
2. Keep API response contract behavior and status/error semantics.
3. Keep security and auth behavior identical.
4. Keep Cosmos data model semantics identical (including soft delete, interview embedding, and status transitions).
5. Keep file upload and processing workflow semantics identical (SAS flow, Event Grid trigger, processUpload logic, latest-wins behavior).
6. Do not introduce paid or additional services unless required to preserve parity.

Working style:

1. Start with a parity matrix before coding:
   Feature | Expected Behavior | Source Doc | Validation Method
2. Then produce a phased implementation plan with acceptance criteria for each phase.
3. Use the project's existing agents in this recommended workflow:
   - **Backend API:** @test-writer → @implementer → @reviewer (TDD cycle per endpoint)
   - **Frontend:** @fe-builder → @fe-test-writer → @reviewer (build-first, then test, then review)
   - **Security:** Run @reviewer for security audit, or use `/security-review` prompt for full codebase audit
   - **Complex features:** Use `/tdd-endpoint` prompt for end-to-end TDD flows
4. Implement in small, verifiable commits.
5. Run tests and validation after each phase.
6. At the end, produce a parity report with evidence.

Required deliverables:

1. Parity Matrix (complete)
2. Implementation Plan (phases + acceptance criteria)
3. Environment and Config Matrix (local, CI, prod)
4. Working implementation
5. Test results summary (frontend and backend)
6. Parity Report (pass/fail per checklist item)
7. Deviations list (if any) with reasons and risk impact

Required output format:

1. Summary of what was implemented
2. Files changed grouped by area (frontend, backend, infra, docs)
3. Commands run and outcomes
4. Test evidence
5. Open risks/blockers
6. Final parity verdict: Full parity or Partial parity

Definition of done:

1. Endpoint surface and behavior matches docs and OpenAPI.
2. Authentication and authorization behavior matches documented owner-only access model.
3. Upload pipeline works end-to-end and metadata update behavior matches current rules.
4. Analytics outputs match expected logic from docs.
5. CI and deployment docs are executable by a new engineer.
6. No critical security regression.

If blocked:

1. Stop immediately and report exact blocker.
2. Propose minimum viable options to unblock.
3. Do not silently change architecture to bypass blockers.

## Strict Parity Checklist

Use this exact checklist and mark each item PASS or FAIL with evidence.

A. Product and UX

1. Application create, list, detail, update, delete, restore flows behave as documented.
2. Interview add, update, delete, reorder flows behave as documented.
3. File upload, file delete, and file download flows behave as documented.
4. Dashboard and chart calculations match documented logic.

B. API and Contract

1. Endpoint list matches documented contract.
2. Request validation behavior matches documented rules.
3. Error behavior matches documented status codes and shape.
4. Response envelope and field-level behavior match documented contract.

C. Auth and Security

1. Function-level owner role enforcement is implemented where required.
2. Unauthorized and forbidden responses behave as documented.
3. Sensitive flows (SAS issuance/download) follow documented protection and validation.

D. Data and Storage

1. Cosmos container usage and partition model semantics match docs.
2. Soft-delete behavior is implemented correctly and excluded from standard list and stats.
3. Blob metadata linkage behavior matches documented rules.
4. Re-upload and latest-wins behavior matches docs.

E. Event Pipeline

1. Blob upload triggers event flow as documented.
2. processUpload behavior and idempotency safeguards match docs.
3. Dead-letter and retry assumptions are respected.

F. Infra and Deployment

1. Infrastructure shape matches documented architecture.
2. Required environment variables and secrets are fully documented.
3. Local, CI, and production runbooks are reproducible.

G. Quality Gates

1. Backend tests pass.
2. Frontend tests pass.
3. Build passes for frontend and backend.
4. No unresolved critical lint/type errors.

## Optional Add-On: Human Developer Brief

If handing to a human developer instead of an AI agent, prepend this:

Please optimize for parity over speed. Before writing code, provide a one-page parity matrix and implementation plan. Every deviation from the documented behavior must be approved before implementation. The project uses TDD patterns; consider adopting the same @test-writer → @implementer → @reviewer workflow if you have access to similar tooling.

## Optional Add-On: AI Agent Workflow

If handing to an AI agent, append this:

This project is equipped with specialized agents for TDD and security review:

**API Implementation (Backend):**

1. For each endpoint, use @test-writer first (red phase), then @implementer (green phase), then @reviewer (quality gate).
2. Apply `.github/instructions/testing.instructions.md` when writing tests.
3. Apply `.github/instructions/api-conventions.instructions.md` when writing/modifying Functions code.
4. OR use the `/tdd-endpoint` prompt file for an end-to-end TDD workflow for complex endpoints.

**Frontend Implementation:**

1. Use @fe-builder to build components first (visual/interactive).
2. Use @fe-test-writer to write tests after build (behavior-driven).
3. Apply `.github/instructions/testing.instructions.md` when writing tests.
4. Use @reviewer to audit for security and design compliance.

**Infrastructure (IaC):**

1. Apply `.github/instructions/bicep.instructions.md` when writing or modifying Bicep templates.
2. Run @reviewer to audit Bicep for security and naming conventions.

**Security & Code Quality:**

1. After implementation milestones, run @reviewer for security and edge case audit.
2. For a comprehensive codebase security audit, use the `/security-review` prompt file.
3. Ensure all critical and high-severity findings are resolved before final parity report.

**Commit Frequency:**

- Commit after each passing agent → agent handoff to preserve auditability.
- Tag commits with agent workflow phase (e.g., "[test-writer]", "[implementer]", "[reviewer]").

Follow these agent → agent handoffs to maintain code quality and ensure every test-driven cycle is rigorous and auditable.

## Suggested Companion Artifacts To Add Over Time

1. Golden test data fixture for deterministic parity checks
2. Screenshot pack for visual parity
3. One-command smoke test script
4. Single source environment variable contract table
