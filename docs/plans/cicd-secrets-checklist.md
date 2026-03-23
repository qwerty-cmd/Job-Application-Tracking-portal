# CI/CD Secrets and Setup Checklist

This runbook defines required GitHub Actions secrets and minimum setup for frontend and backend deployment.

## Required Secrets

Set these in GitHub repository settings:

- `AZURE_STATIC_WEB_APPS_API_TOKEN`
  : Deployment token for the target Azure Static Web App.
- `VITE_API_URL`
  : Production base URL for the Azure Functions API, e.g. `https://func-jobtracker.azurewebsites.net`.
- `VITE_APPINSIGHTS_CONNECTION_STRING` (optional)
  : Browser telemetry connection string.
- `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`
  : Publish profile XML for deploying `func-jobtracker` via `.github/workflows/azure-functions.yml`.

## Where to Configure

1. Open the repository on GitHub.
2. Go to `Settings` -> `Secrets and variables` -> `Actions`.
3. Create each secret exactly as named above.

## Getting SWA Deployment Token

1. In Azure Portal, open your Static Web App resource.
2. Go to `Manage deployment token`.
3. Copy the token.
4. Save it as `AZURE_STATIC_WEB_APPS_API_TOKEN` in GitHub.

## Validation Checklist

- [ ] `.github/workflows/azure-static-web-apps.yml` exists on `main`.
- [ ] `.github/workflows/azure-functions.yml` exists on `main`.
- [ ] All required secrets are configured.
- [ ] A push to `main` triggers `Quality Gates (Client)` and then `Deploy to Azure Static Web Apps`.
- [ ] A push to `main` that changes `api/**` triggers `Quality Gates (API)` and then `Deploy to Azure Functions`.
- [ ] Client app loads in production and points to `VITE_API_URL`.

## Notes

- Pull requests run quality gates only (tests/build), not production deploy.
- Manual `workflow_dispatch` is enabled for both workflows, and deploy jobs are restricted to `main` only.
