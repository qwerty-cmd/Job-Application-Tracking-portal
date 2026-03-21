# Phase 3 — Event Streaming Pipeline: Deployment Challenges & Resolutions

**Date:** 2026-03-21
**Phase:** 3 — Event Streaming Pipeline
**Scope:** Deploy Function App, enable Event Grid subscription, E2E verify upload pipeline, verify dead-lettering

---

## Challenge 1: Deployment Package Too Large (32 MB)

**Symptom:** First `func azure functionapp publish` uploaded a 32 MB package, including `node_modules/`, source TypeScript files, test files, and editor config.

**Root Cause:** No `.funcignore` file existed in the `api/` project. Without it, the Azure Functions CLI packages everything in the directory.

**Resolution:** Created `api/.funcignore` to exclude unnecessary files:

```
# Source files (compiled output is in dist/)
src/

# Test files
*.test.ts
*.test.js

# TypeScript config
tsconfig.json
tsconfig.test.json

# Vitest config
vitest.config.ts

# Local settings (contains secrets)
local.settings.json

# Editor and git files
.git*
.vscode

# Dev scripts
run
```

**Lesson:** Always create `.funcignore` before first deployment. It mirrors `.gitignore` semantics but controls what goes into the deployment zip.

---

## Challenge 2: `@azure/functions` Missing at Runtime

**Symptom:** After deploying, functions failed to load because `@azure/functions` was listed under `devDependencies` in `package.json`. Azure Functions runtime runs `npm install --production`, which skips devDependencies.

**Root Cause:** During project scaffolding, `@azure/functions` was placed in `devDependencies` (common in starter templates that assume local-only usage). On Azure, only `dependencies` are installed.

**Resolution:** Moved `@azure/functions` from `devDependencies` to `dependencies` in `api/package.json`.

**Lesson:** Any package required at runtime — including the Azure Functions SDK itself — must be in `dependencies`, not `devDependencies`.

---

## Challenge 3: All HTTP Routes Return 404 Despite Successful Deployment

**Symptom:** After deploying, `func azure functionapp publish` reported all 16 functions as registered. The Azure admin API (`/admin/functions`) listed them correctly. However, every HTTP endpoint returned 404.

**Root Cause:** The `main` field in `package.json` was set to a glob pattern:

```json
{ "main": "dist/functions/*/index.js" }
```

Azure Functions v4 (Node.js) uses the `main` field to locate the entry point. Glob patterns work locally on Windows but **do not resolve on Azure's Linux Consumption plan**. The runtime couldn't find any function registrations because it never loaded any of the individual `index.js` files.

**Resolution:** Created a single entry point `api/src/index.ts` that explicitly imports all 16 function modules:

```typescript
// Single entry point — imports all function registrations
import "./functions/addInterview/index.js";
import "./functions/createApplication/index.js";
import "./functions/deleteApplication/index.js";
// ... all 16 functions
```

Updated `package.json`:

```json
{ "main": "dist/index.js" }
```

This gives the runtime a single, deterministic file to load, which in turn triggers all function registrations via their side-effect imports.

**Lesson:** Never rely on glob patterns in `package.json` `main` for Azure Functions. Use a single entry point file that imports all function modules. This is the most reliable pattern across all Azure Functions hosting environments (Windows, Linux, Consumption, Premium).

---

## Challenge 4: SAS Token Endpoints Return 500 — Missing `STORAGE_ACCOUNT_KEY`

**Symptom:** After deployment, `POST /api/upload/sas-token` and `GET /api/download/sas-token` returned HTTP 500. Other endpoints (CRUD operations using Cosmos DB) worked fine.

**Root Cause:** The `STORAGE_ACCOUNT_KEY` environment variable was not configured on the Function App. The Bicep template (`infra/main.bicep`) had `STORAGE_ACCOUNT_NAME` and `STORAGE_CONNECTION_STRING` but was missing `STORAGE_ACCOUNT_KEY`. The SAS token generation code in `uploadSasToken` and `downloadSasToken` uses `STORAGE_ACCOUNT_KEY` to sign the tokens, and it throws when the env var is undefined.

**Resolution:**

1. **Immediate fix:** Set the variable directly via CLI:

   ```bash
   az functionapp config appsettings set \
     --name func-jobtracker \
     --resource-group job-tracker-rg \
     --settings "STORAGE_ACCOUNT_KEY=$(az storage account keys list \
       --account-name stjobtrackermliokt \
       --resource-group job-tracker-rg \
       --query '[0].value' -o tsv)"
   ```

2. **Permanent fix:** Added the app setting to `infra/main.bicep`:
   ```bicep
   {
     name: 'STORAGE_ACCOUNT_KEY'
     value: storageAccount.listKeys().keys[0].value
   }
   ```

**Lesson:** When adding new environment variables in `local.settings.json`, always mirror them in the Bicep template. Local-only settings don't exist on Azure — every variable the app reads must be provisioned in infrastructure.

---

## Challenge 5: `processUpload` Crashes on Event Grid Retry After Re-Upload

**Symptom:** During E2E testing, after uploading a resume and then re-uploading a new one, the resume field in Cosmos intermittently became `null`. Application Insights showed unhandled exceptions in `processUpload`.

**Root Cause:** The re-upload flow works as follows:

1. User uploads `resume-v1.pdf` → Event Grid fires Event A → `processUpload` updates Cosmos with v1 metadata
2. User uploads `resume-v2.pdf` → Event Grid fires Event B → `processUpload` updates Cosmos with v2 metadata, **deletes** the v1 blob
3. Event Grid **retries** Event A (delivery guarantee) → `processUpload` calls `blockBlobClient.getProperties()` on the v1 blob → **404 crash** (blob was deleted in step 2)

The `getProperties()` call had no error handling for the case where the blob no longer exists.

**Resolution:** Wrapped `getProperties()` in a try/catch that handles 404 gracefully:

```typescript
let properties;
try {
  properties = await blockBlobClient.getProperties();
} catch (err: unknown) {
  const statusCode = (err as { statusCode?: number }).statusCode;
  if (statusCode === 404) {
    context.log(
      `Blob not found (already deleted): ${containerName}/${blobName} — skipping`,
    );
    return;
  }
  throw err; // Re-throw non-404 errors
}
```

**Lesson:** Event Grid guarantees at-least-once delivery. Any event handler triggered by Event Grid **must** be idempotent and handle the case where the underlying resource (blob, record, etc.) no longer exists. This is especially important in re-upload/overwrite scenarios where one event's processing can invalidate another event's assumptions.

---

## Summary

| #   | Challenge                                   | Category                 | Severity     | Time to Diagnose |
| --- | ------------------------------------------- | ------------------------ | ------------ | ---------------- |
| 1   | No `.funcignore` — 32 MB package            | Deployment config        | Low          | Quick            |
| 2   | `@azure/functions` in devDependencies       | Dependency management    | Medium       | Quick            |
| 3   | Glob pattern in `main` — 404 on all routes  | Runtime behaviour        | **Critical** | Extended         |
| 4   | Missing `STORAGE_ACCOUNT_KEY` env var       | Infrastructure gap       | Medium       | Moderate         |
| 5   | `getProperties()` crash on Event Grid retry | Event-driven idempotency | **Critical** | Moderate         |

### Key Takeaways

1. **Test on Azure early and often.** Challenges 1–3 only manifested on Azure's Linux Consumption plan, not locally. Local `func start` masks deployment issues.
2. **Treat IaC as the single source of truth for environment config.** Any variable in `local.settings.json` must also exist in Bicep.
3. **Design for at-least-once delivery from day one.** Event Grid retries are not edge cases — they're guaranteed behaviour. Every event handler must handle stale, duplicate, and out-of-order events.
4. **Avoid platform-specific assumptions.** Glob patterns in `main` worked on Windows but not Linux. Explicit imports are universally reliable.
