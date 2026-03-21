# Postman Collection — Job Application Tracker API

## Files

| File                                                  | Description                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `job-application-tracker-api.postman_collection.json` | Full Postman v2.1 collection with all 16 API endpoints                         |
| `job-tracker-local.postman_environment.json`          | Environment for local development (`http://localhost:7071`)                    |
| `job-tracker-azure.postman_environment.json`          | Environment for Azure production (`https://func-jobtracker.azurewebsites.net`) |

## Import on Another Machine

1. Open Postman → **Import** (or `Ctrl+O`)
2. Drag all 3 JSON files into the import dialog
3. Select the appropriate environment (Local or Azure) from the environment dropdown

## Collection Structure

- **Applications** — List, Create, Get, Update, Delete, Restore, List Deleted
- **Interviews** — Add, Update, Delete, Reorder
- **Files** — Upload SAS Token, Download SAS Token, Delete File
- **Dashboard** — Get Stats

## Authentication

All requests use the `x-ms-client-principal` header (Azure SWA auth).

- **Local dev:** The Local environment includes a pre-set base64 `clientPrincipal` variable with the `owner` role.
- **Azure:** Fill in the `clientPrincipal` variable after deploying and authenticating via SWA.

## Variables

| Variable              | Purpose                                                          |
| --------------------- | ---------------------------------------------------------------- |
| `{{baseUrl}}`         | API host — switches between local and Azure via environment      |
| `{{applicationId}}`   | Set after creating an application, reuse across related requests |
| `{{interviewId}}`     | Set after adding an interview, reuse in update/delete/reorder    |
| `{{clientPrincipal}}` | Base64-encoded `x-ms-client-principal` auth header               |

## OpenAPI Spec

The OpenAPI 3.0 spec is also available at `api/openapi.yaml` for use with Swagger UI or other OpenAPI tooling.
