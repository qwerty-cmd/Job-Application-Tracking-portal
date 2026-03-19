---
description: "Use when writing or modifying Bicep infrastructure templates. Covers naming conventions, required resources, and outputs for this project."
applyTo: "infra/**/*.bicep"
---

# Bicep Conventions

## Resources Required

- Cosmos DB (free tier, database: `jobtracker`, container: `applications`, partition key: `/id`)
- Storage Account (LRS, containers: `resumes`, `coverletters`, `jobdescriptions`, `deadletter`)
- Azure Functions (Consumption plan, Node.js runtime)
- Azure Static Web Apps (free tier)
- Event Grid system topic (from Storage) + subscription (BlobCreated filter, dead-letter to `deadletter`)

## Security

- CORS on Storage: allow only SWA origin (`https://*.azurestaticapps.net`), methods: PUT, GET, HEAD
- Blob Storage lifecycle policy: 90-day TTL (delete blobs not modified in 90 days)
- SWA route config: all routes require `owner` role

## Outputs Required

- SWA hostname
- Function app name
- Cosmos DB endpoint
- Storage account name

## Structure

- `infra/main.bicep` — entrypoint
- `infra/parameters.json` — environment-specific values
- Use `@description()` decorators on parameters
