# Setup Guide for AI-Assisted Rebuild (Claude et al)

Use this guide to prepare your project for handoff to an AI coding agent (Claude, Copilot, etc.) for autonomous rebuild with parity validation.

---

## Pre-Work Checklist (YOU Do This)

### Azure Infrastructure

- [ ] Azure subscription created and active
- [ ] Resource group `job-tracker-rg` created
- [ ] Azure CLI installed and authenticated (`az login`)
- [ ] SWA deployment token retrieved and saved securely

**Where to get each:**

| Item                 | How to Get                                                     |
| -------------------- | -------------------------------------------------------------- |
| Subscription ID      | `az account show --query id -o tsv`                            |
| SWA Deployment Token | Azure Portal → Static Web App → Manage deployment token → Copy |
| Resource Group       | `az group create --name job-tracker-rg --location eastus`      |

### Local Development Environment

- [ ] Node.js 20+ installed (`node --version`)
- [ ] Azure Functions Core Tools v4 installed (`func --version`)
- [ ] Git cloned: `git clone <repo-url> && cd <repo>`
- [ ] All `.env` files populated with real secrets (see Environment Variable Matrix below)

### Environment Variable Matrix

Populate these BEFORE handing off to AI. The AI cannot directly access cloud secrets; you provide them.

**File: `api/local.settings.json`** (Local development)

| Variable                    | Required | Example                                              | Source                                             |
| --------------------------- | -------- | ---------------------------------------------------- | -------------------------------------------------- |
| `COSMOS_ENDPOINT`           | ✅       | `https://cosmos-jobtracker.documents.azure.com:443/` | Azure Portal → Cosmos DB → URI                     |
| `COSMOS_KEY`                | ✅       | `<primary-key>`                                      | Azure Portal → Cosmos DB → Keys                    |
| `COSMOS_DATABASE_NAME`      | ✅       | `jobtracker`                                         | Hardcoded; do not change                           |
| `COSMOS_CONTAINER_NAME`     | ✅       | `applications`                                       | Hardcoded; do not change                           |
| `STORAGE_ACCOUNT_NAME`      | ✅       | `stjobtrackermliokt`                                 | Azure Portal → Storage Account → Name              |
| `STORAGE_ACCOUNT_KEY`       | ✅       | `<access-key>`                                       | Azure Portal → Storage Account → Access Keys       |
| `STORAGE_CONNECTION_STRING` | ✅       | `DefaultEndpointsProtocol=https;AccountName=...`     | Azure Portal → Storage Account → Connection String |

**File: `client/.env.production`** (Production build)

| Variable                             | Required | Example                                     | Format                                   |
| ------------------------------------ | -------- | ------------------------------------------- | ---------------------------------------- |
| `VITE_API_URL`                       | ✅       | `https://func-jobtracker.azurewebsites.net` | Function App URL                         |
| `VITE_APPINSIGHTS_CONNECTION_STRING` | ❌       | `InstrumentationKey=...`                    | Application Insights → Connection String |

---

## How AI Agents Access Your Project

**Important:** AI agents read files through your file system AND through context you paste into the chat. They do NOT have direct Azure access.

### AI Can Access:

1. ✅ Any file in your repo that you open in VS Code or paste into the chat
2. ✅ Your local `.env` files (if you paste the values or open the file)
3. ✅ Test output (if you run tests and paste results)
4. ✅ Build logs and errors (if you paste them)

### AI Cannot Access:

1. ❌ Azure Portal directly
2. ❌ Azure CLI (unless you copy/paste command output)
3. ❌ Private keys or secrets (they should be in local `.env`, not pasted into chat)
4. ❌ Running commands (you must run them and report results)

### How to Show AI the `.github` Folder

The `.github/` folder contains critical context (instructions, conventions, agents). AI agents need to see it.

**Option 1: Open files individually in VS Code chat**

1. In VS Code, open any file from `.github/`
2. Right-click → "Chat" or use the Copilot chat pane
3. Reference the file: "@.github/copilot-instructions.md" or inline the content

**Option 2: Paste the contents into chat**

```
Read these files from the project:

.github/copilot-instructions.md:
[paste full content]

.github/instructions/api-conventions.instructions.md:
[paste full content]

etc.
```

**Option 3: Use the master prompt with all references**

- Open `docs/guides/rebuild-parity-master-prompt.md`
- Copy the full prompt
- Paste into your AI agent with a single message: "Rebuild this project [paste prompt]"
- The prompt already references all required files by path

---

## How to Hand Off to AI: Example Conversation Flow

### Step 1: Paste the Master Prompt

**You (in chat):**

```
I'm handing off my project to you for an exact rebuild with parity validation.
Start with this master prompt:

[Paste full content of docs/guides/rebuild-parity-master-prompt.md]

My Azure environment is set up. Here's what's ready:
- Subscription ID: <sub-id>
- Resource Group: job-tracker-rg
- SWA Deployment Token: [saved in secure location]
- All local .env files are populated with real secrets

Proceed with the parity matrix and implementation plan.
```

### Step 2: AI Asks for Context

**AI (expected):**

```
I need to read the full project context. Can you paste or open:
1. .github/copilot-instructions.md
2. .github/instructions/api-conventions.instructions.md
3. .github/instructions/bicep.instructions.md
4. .github/instructions/testing.instructions.md
```

**You:**
Open each file in VS Code and either:

- Reference: "@.github/copilot-instructions.md" in the chat
- Or copy/paste the full content

### Step 3: AI Produces Parity Matrix

**AI:**

```
Here's the parity matrix I've constructed...
[Large structured table of features vs behavior vs validation]

Is this correct? Any deviations from what you expect?
```

**You:**
Review and confirm, or ask AI to adjust.

### Step 4: AI Codes, You Validate

**AI:**

```
I've generated /api/shared/auth.ts.
Run these commands and paste the output:
  cd api
  npm run build
  npm run test:auth
```

**You:**
Run the commands locally:

```powershell
cd api
npm run build
npm run test

# Paste output to AI
```

**You (in chat):**

```
Build output:
```

[paste build output]

```

Test output:
[paste test output]
```

**AI:**

```
✅ Build clean, ✅ 8/8 tests passing for auth.
Moving to next phase...
```

### Step 5: Final Parity Report

**AI:**

```
## Parity Report

[Section A: Product UX]
- Application CRUD: PASS (all tests green, manual flow verified)
- Interviews: PASS
[... full checklist ...]

## Summary
- All 16 endpoints implemented
- All 266 tests passing
- Security audit: 0 critical, 2 medium (low-impact logging)
- Infra deployment: Ready (Bicep validated)

## Next: Git Push
Tell me to run:
  git add .
  git commit -m "[rebuild] Full parity rebuild with exact match to current"
  git push origin main
```

**You:**
Confirm and run the git commands if happy.

---

## One-Command Verification Steps

After AI implements each phase, run these locally and report results:

**Backend Build & Test:**

```powershell
cd api
npm run build 2>&1 | Tee-Object -Variable build_output
$build_output | Select-Object -Last 20  # Last 20 lines to AI
npm run test 2>&1 | Tee-Object -Variable test_output
$test_output | Select-Object -Last 30  # Last 30 lines to AI
```

**Frontend Build & Test:**

```powershell
cd client
npm run build 2>&1 | Tee-Object -Variable fe_build
$fe_build | Select-Object -Last 20
npm run test 2>&1 | Tee-Object -Variable fe_test
$fe_test | Select-Object -Last 30
```

**Infrastructure Validation:**

```powershell
cd infra
# (No build step; Bicep is validated by Azure)
# Report to AI: "Bicep files reviewed for naming conventions and outputs."
```

**Report Template to Paste to AI:**

```
Build & Test Results:

BACKEND:
- Build: [PASS/FAIL] - [last 5 lines of output]
- Tests: [X/Y passing] - [last 5 lines]

FRONTEND:
- Build: [PASS/FAIL] - [last 5 lines]
- Tests: [X/Y passing] - [last 5 lines]

INFRA:
- [Status]
```

---

## Critical Handoff Checklist

Before saying "go" to the AI:

- [ ] All `.env` files populated with real Azure secrets
- [ ] `.github/` folder structure explained
- [ ] Master prompt saved and ready to paste
- [ ] You understand you'll be running local commands (npm, func, git)
- [ ] You have Azure Portal access to verify resource names
- [ ] You have 30 minutes to periodically check AI progress and provide test output
- [ ] You're comfortable with the strict parity approach (no redesign)

---

## If AI Gets Blocked

**Common blocks and unblocks:**

| Issue                                   | AI Says                      | You Do                                                                         |
| --------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| "Can't read .github files"              | "I need api-conventions.md"  | Paste or open in VS Code chat                                                  |
| "Missing env vars"                      | "COSMOS_KEY is undefined"    | Check `api/local.settings.json` has the key from Azure                         |
| "Tests won't run"                       | "Can't find Vitest config"   | Run `npm install` in `/api` and report results                                 |
| "Don't know current Azure output names" | "What's my Cosmos endpoint?" | Paste from Azure Portal or run `az cosmosdb show --name cosmos-jobtracker ...` |
| "Can't push to git"                     | "Permission denied on main"  | You run git commands; AI just tells you what to run                            |

---

## Success Criteria

You're done when:

1. ✅ All 16 API endpoints rebuilt and tests passing
2. ✅ Frontend UI matching current behavior (35+ tests passing)
3. ✅ Parity report shows **FULL PARITY** on all checklist items
4. ✅ Code pushed to `main` with clean commit history
5. ✅ No critical security findings from @reviewer
6. ✅ You've spot-checked 2–3 key flows by hand (create app, upload file, view dashboard)

---

## Summary

**AI Agent's Role:** Write code, run tests (via your terminal), produce reports, invoke agents, maintain parity.

**Your Role:** Provide secrets, run builds/tests, verify outputs, push to git, spot-check UX.

**Neither alone, but together:** Exact parity rebuild with full auditability.
