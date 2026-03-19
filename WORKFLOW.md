# Development Workflow Guide

How to build this project using TDD agents in VS Code GitHub Copilot Chat.

---

## Prerequisites

- VS Code with GitHub Copilot extension
- Copilot Chat panel open (Ctrl+Shift+I or click the chat icon)
- This repo cloned and open as workspace

---

## Your TDD Agents

You have 3 custom agents in `.github/agents/`. Invoke them by typing `@agentname` in Copilot Chat.

### @test-writer — Red Phase (Write Failing Tests)

**What it does:** Reads the endpoint spec from CLAUDE.md and writes a complete test file with all test cases. Confirms they all fail.

**When to use:** Before any implementation exists for an endpoint.

**Example:**

```
@test-writer Write tests for POST /api/applications
```

**What it produces:** A test file at `api/functions/<functionName>/<functionName>.test.ts` with tests for:

- Happy path (valid input → expected response)
- Validation errors (missing fields, invalid enums, future dates)
- Not found (404 for non-existent IDs)
- Business rules (auto-status updates, rejection requirements)
- Edge cases (null optional fields, boundary values)

**Rules it follows:**

- ONLY creates/edits test files — never touches source code
- Tests are designed to FAIL (that's the point)
- Uses Jest or Vitest (whichever is configured)

---

### @implementer — Green Phase (Make Tests Pass)

**What it does:** Reads the failing tests, implements the minimum code to make them pass, and iterates until green.

**When to use:** After @test-writer has created failing tests.

**Example:**

```
@implementer Make the createApplication tests pass
```

**What it produces:** Implementation files (e.g., `api/functions/createApplication/index.ts`) with the function code.

**Rules it follows:**

- NEVER modifies test files — only writes source/production code
- Follows CLAUDE.md conventions (`{ data, error }` response shape, singleton Cosmos client)
- Runs tests after each change
- Stops when all tests pass — doesn't add untested features

---

### @reviewer — Review Phase (Security & Consistency Audit)

**What it does:** Reviews code for security vulnerabilities, edge cases, and consistency with the design docs. Read-only — never modifies files.

**When to use:** After implementation is complete and tests pass.

**Example:**

```
@reviewer Review the createApplication function
```

**What it produces:** A report grouped by severity:

- **CRITICAL** — Security vulnerabilities (must fix)
- **HIGH** — Logic errors, missing validation
- **MEDIUM** — Inconsistency with spec
- **LOW** — Code quality suggestions

**Rules it follows:**

- NEVER modifies any files — read-only analysis
- Checks against OWASP Top 10
- Verifies consistency with CLAUDE.md
- Cites specific file paths and line numbers

---

## Your Prompt Files

Invoke prompts by typing `/promptname` in Copilot Chat.

### /tdd-endpoint — Full TDD Cycle

Runs all three phases (red → green → review) for a single endpoint in one go.

**Example:**

```
/tdd-endpoint POST /api/applications
```

**What happens:**

1. Reads the endpoint contract from CLAUDE.md
2. Writes all test cases (confirms they fail)
3. Implements the function (iterates until tests pass)
4. Reviews for security and consistency

### /security-review — Full Codebase Audit

Runs the reviewer agent against the entire codebase.

**Example:**

```
/security-review
```

---

## Auto-Loading Instructions

These files in `.github/instructions/` auto-load based on what file you're editing. You don't invoke them — they're automatic.

| File Pattern       | Instruction Loaded | What It Provides                                          |
| ------------------ | ------------------ | --------------------------------------------------------- |
| `api/**/*.ts`      | api-conventions    | Response shape, Cosmos patterns, status codes, validation |
| `api/**/*.test.ts` | testing            | Test structure, naming, assertions, mocking               |
| `infra/**/*.bicep` | bicep              | Required resources, CORS, lifecycle, outputs              |

---

## Phase-by-Phase Workflow

### Phase 1: Infrastructure (Bicep)

No TDD agents needed — Bicep is infrastructure, not testable API code. Work directly in chat.

```
Read CLAUDE.md for full project context. Create the Bicep infrastructure
files: infra/main.bicep and infra/parameters.json with all required
Azure resources.
```

The bicep instructions auto-load when editing `infra/**/*.bicep`.

**Build order:**

1. Cosmos DB (free tier, `jobtracker` db, `applications` container, partition key `/id`)
2. Storage Account + 4 containers (`resumes`, `coverletters`, `jobdescriptions`, `deadletter`) + CORS + 90-day lifecycle
3. Function App (Consumption plan, Node.js runtime)
4. Static Web App (free tier, GitHub integration, `owner` role routes)
5. Event Grid system topic + subscription (BlobCreated filter, dead-letter)
6. `parameters.json` + deploy with `az deployment group create`
7. Verify outputs (SWA hostname, Function app name, Cosmos endpoint, Storage account name)

**Deploy command:**

```bash
az deployment group create -g job-tracker-rg -f infra/main.bicep -p infra/parameters.json
```

---

### Phase 2: Backend API (TDD agents)

**Step 1 — Scaffold the project (one-time setup):**

```
Scaffold the Azure Functions project in the api/ folder with TypeScript.
Install dependencies and create the singleton Cosmos client at
api/shared/cosmosClient.ts. Read CLAUDE.md for conventions.
```

**Step 2 — Build each endpoint with TDD:**

For each endpoint, run these three commands in order:

```
@test-writer Write tests for POST /api/applications
```

Wait for tests → confirm they fail. Then:

```
@implementer Make the createApplication tests pass
```

Wait for implementation → confirm tests pass. Then:

```
@reviewer Review the createApplication function
```

Fix any issues found, re-run tests.

**Or use the shortcut:**

```
/tdd-endpoint POST /api/applications
```

**Recommended endpoint order** (each builds on the previous):

| #   | Endpoint                              | Why this order                     |
| --- | ------------------------------------- | ---------------------------------- |
| 1   | `POST /api/applications`              | Foundation — creates data          |
| 2   | `GET /api/applications/:id`           | Needed to verify creates work      |
| 3   | `GET /api/applications`               | List with filters, pagination      |
| 4   | `PATCH /api/applications/:id`         | Updates + rejection validation     |
| 5   | `DELETE /api/applications/:id`        | Soft delete                        |
| 6   | `PATCH /:id/restore`                  | Undelete                           |
| 7   | `GET /api/applications/deleted`       | Deleted list for undo UI           |
| 8   | `POST /:id/interviews`                | Add interview (auto-status update) |
| 9   | `PATCH /:id/interviews/:interviewId`  | Update interview                   |
| 10  | `DELETE /:id/interviews/:interviewId` | Remove interview                   |
| 11  | `PATCH /:id/interviews/reorder`       | Reorder interviews                 |
| 12  | `POST /api/upload/sas-token`          | Upload SAS token                   |
| 13  | `GET /api/download/sas-token`         | Download SAS token                 |
| 14  | `DELETE /:id/files/:fileType`         | Delete uploaded file               |
| 15  | `GET /api/applications/stats`         | Dashboard statistics               |

---

### Phase 3: Event Pipeline (TDD agents)

```
@test-writer Write tests for the processUpload Event Grid trigger function
```

Then `@implementer` → `@reviewer` as usual.

Key things processUpload tests should cover:

- Size check (> 10 MB → delete blob, exit)
- Magic bytes validation (PDF, DOCX, HTML)
- Soft-deleted application skip
- "Latest wins" timestamp comparison
- Idempotent old blob deletion
- Container name → fileType derivation

---

### Phase 4: Frontend (React)

No TDD agents — build directly in chat:

```
Read CLAUDE.md for the full spec. Scaffold the React app in client/
with Vite + TypeScript. Create the API service layer and the
Dashboard page first.
```

---

### Phase 5: CI/CD & Deployment

```
Read CLAUDE.md. Set up the GitHub Actions workflow for Azure Static
Web Apps deployment at .github/workflows/azure-static-web-apps.yml.
```

---

### Phase 6: Polish

Run a full security review:

```
/security-review
```

---

## Tips

- **Each `@agent` call runs in its own context.** It reads your workspace files fresh. You don't need to paste specs — the agents read CLAUDE.md themselves.
- **Scoped instructions auto-load.** When @implementer creates `api/functions/createApplication/index.ts`, the api-conventions instructions are automatically available to it.
- **One endpoint at a time.** Don't ask @test-writer to write tests for multiple endpoints in one request. Keep it focused.
- **Review after each endpoint, not at the end.** Catching issues early is cheaper than fixing them across 15 endpoints.
- **If an agent makes a mistake,** start a new chat and re-invoke it. Each agent call is stateless.
- **CLAUDE.md is the source of truth.** All agents reference it. If you change a design decision, update CLAUDE.md first — the agents pick it up automatically.
