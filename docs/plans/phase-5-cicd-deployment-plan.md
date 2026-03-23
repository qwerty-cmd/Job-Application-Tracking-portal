# Phase 5 Plan - CI/CD and Deployment

This document is the detailed execution plan for Phase 5.

## Goal

Complete automated deployment for the frontend and establish a reliable deployment workflow for the backend, then verify production readiness end-to-end.

## Scope

In scope:

- GitHub Actions workflow for Azure Static Web Apps frontend deployment
- Environment variable and secret wiring for production
- Production smoke testing and rollback checklist
- Documentation updates for deployment operations

Companion setup checklist: `docs/plans/cicd-secrets-checklist.md`

Out of scope:

- New product features (Phase 6)
- API redesign or schema changes
- Infrastructure topology changes unless required to unblock deployment

## Current Baseline

- Infrastructure is already deployed (SWA + Function App + Cosmos DB + Blob + Event Grid).
- Frontend is complete for Phase 4.
- API endpoints and event pipeline are complete and tested.
- Frontend and backend CI/CD workflows exist in `.github/workflows/azure-static-web-apps.yml` and `.github/workflows/azure-functions.yml`.
- SWA Free tier is in use, so API auth is enforced in Azure Functions using x-ms-client-principal and owner role checks.

## Phase 5 Deliverables

1. Frontend CI/CD pipeline in GitHub Actions
2. Production runtime config validated (frontend env vars, Function CORS, auth behavior)
3. Deployment runbook in docs
4. Production smoke-test evidence captured in DEVLOG
5. CLAUDE and TIMELINE status updated to reflect Phase 5 execution state

## Workstream A - Frontend CI/CD (Required)

### A1. Create workflow file

Create .github/workflows/azure-static-web-apps.yml with:

- Trigger: push to main, pull_request to main
- Frontend app location: client
- Output location: dist
- Build command: npm run build
- Node version: 20.x
- Secure deployment token from GitHub Secret

### A2. Required GitHub repository secrets

Add these repository secrets:

- AZURE_STATIC_WEB_APPS_API_TOKEN
- VITE_API_URL
- VITE_APPINSIGHTS_CONNECTION_STRING (optional if telemetry is desired in production)

Notes:

- VITE\_ prefixed values are injected at frontend build time.
- Do not hardcode production URLs in source files.

### A3. Build and deploy behavior

- On push to main: build and deploy frontend
- On pull_request: build and validate; optional preview environment can be enabled later
- Add concurrency control to cancel stale runs on rapid successive pushes

### A4. Quality gates in workflow

Before deployment job runs on main:

- npm ci
- npm run test
- npm run build

Fail fast if tests or build fail.

## Workstream B - Backend Deployment Strategy (Implemented)

Backend deployment is automated using `.github/workflows/azure-functions.yml`.

- Trigger: push to `main` (scoped to API path changes) and manual `workflow_dispatch`
- Deployment guardrail: deploy job only runs from `refs/heads/main`
- Quality gates: `npm ci`, `npm run test`, `npm run build`
- Artifact deployment: deploys packaged API artifact via `Azure/functions-action@v1`
- Secret required: `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`

Operational note:

- The workflow includes a pre-deploy validation for `WEBSITE_RUN_FROM_PACKAGE` compatibility before ZipDeploy.

## Workstream C - Production Configuration Checks

### C1. Frontend production config

Confirm:

- client uses VITE_API_URL at build time
- client telemetry uses VITE_APPINSIGHTS_CONNECTION_STRING when provided
- MSW is disabled in production by current boot logic

### C2. Function App configuration

Confirm Function App app settings are present and valid:

- COSMOS_ENDPOINT
- COSMOS_KEY
- COSMOS_DATABASE_NAME
- COSMOS_CONTAINER_NAME
- STORAGE_ACCOUNT_NAME
- STORAGE_ACCOUNT_KEY
- APPLICATIONINSIGHTS_CONNECTION_STRING

### C3. CORS and auth

Confirm Function App CORS includes:

- SWA production hostname
- Local SWA CLI origin for integration testing if needed

Confirm auth behavior:

- Unauthenticated requests to API return 401
- Authenticated non-owner requests return 403
- Owner requests succeed

## Workstream D - Smoke Testing (Release Gate)

Run this checklist after each main deployment:

1. Frontend availability

- Open SWA production URL
- Verify app shell and navigation load

2. Authentication

- Login with GitHub
- Confirm owner-only route access behaves as expected

3. Core CRUD

- Create application
- Edit status and fields
- Soft delete and restore

4. Interviews

- Add, edit, reorder, delete interview round

5. File flows

- Request upload SAS
- Upload file (resume or cover letter)
- Verify processUpload updates application metadata
- Request download SAS and download file
- Delete a file from application

6. Analytics

- Verify dashboard stats endpoint-backed cards/charts render

7. Regression checks

- Confirm no console errors that block usage
- Confirm API errors are surfaced in UI with expected message formatting

## Workstream E - Rollback and Recovery

If frontend deployment breaks production:

- Re-run last known good workflow run if supported
- Or deploy from last known good commit
- Capture issue and mitigation in DEVLOG and create RCA note in docs

If backend issue impacts production:

- Redeploy previous stable function package
- Validate processUpload queue/event behavior after recovery

## Execution Order

1. Configure repository secrets
2. Run first deployments on main (frontend + backend)
3. Execute smoke test checklist and fix issues
4. Run rollback drill and capture notes
5. Update CLAUDE, DEVLOG, and TIMELINE status

## Definition of Done for Phase 5

Phase 5 is complete when all are true:

- Frontend auto-deploys from main via GitHub Actions
- Deployment required secrets and env vars are documented and validated
- Production smoke test checklist passes
- Deployment rollback path is documented
- Project docs are synchronized with current status and decisions

## Risks and Mitigations

Risk: Missing or incorrect build-time VITE variables

- Mitigation: Validate env values in workflow logs and post-deploy smoke tests

Risk: CORS mismatch between SWA hostname and Function App

- Mitigation: Keep hostname list explicit and verify after deploy

Risk: Auth mismatch due to SWA Free standalone backend behavior

- Mitigation: Keep Function-level owner validation as enforcement source of truth

Risk: Pipeline flakiness from npm install variability

- Mitigation: Use npm ci and cache node modules in workflow

## Tracking Template

Use this checklist during execution:

- [x] Workflow file created and committed
- [ ] GitHub secrets added
- [ ] First main deployment successful
- [ ] Smoke test checklist passed
- [x] Backend strategy decision recorded
- [ ] CLAUDE status updated
- [ ] TIMELINE status updated
- [ ] DEVLOG deployment summary added
