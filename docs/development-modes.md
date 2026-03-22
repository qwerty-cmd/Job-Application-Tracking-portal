# Development & Deployment Modes

This project supports three modes for running the application, from fully local to fully live in Azure.

---

## Mode 1: Full Mock (Local Development)

**Frontend:** Vite dev server (local)
**Backend:** MSW (Mock Service Worker) — no real API
**Auth:** SWA CLI mock auth
**Database/Storage:** None — all data is in-memory mock data

### When to use

- Building and testing UI components
- Iterating on frontend features without deploying backend
- Offline development
- Running the app on a machine without Azure credentials

### How it works

1. MSW intercepts all `/api/*` fetch calls in the browser and returns mock responses defined in `client/src/mocks/handlers.ts`.
2. SWA CLI provides a mock auth flow at `/.auth/login/github` — no real GitHub OAuth required.
3. The `enableMocking()` function in `client/src/main.tsx` loads the MSW browser worker **only** when `import.meta.env.MODE === "development"`. In production builds, MSW is tree-shaken out entirely.

### Setup

```bash
# Install dependencies (first time)
cd client && npm install

# Start with SWA CLI using the "mock" config (recommended — provides mock auth)
# IMPORTANT: Do NOT use apiDevserverUrl or apiLocation — SWA CLI would proxy
# /api/* requests to the backend server, bypassing MSW entirely (causes 502).
npx swa start --config-name mock
# Open http://localhost:4280

# Or start Vite directly (no mock auth — login will fail)
npm run dev
# Open http://localhost:5173
```

### Key files

| File                                 | Purpose                                                             |
| ------------------------------------ | ------------------------------------------------------------------- |
| `client/src/mocks/handlers.ts`       | MSW request handlers — defines mock API responses for all endpoints |
| `client/src/mocks/browser.ts`        | MSW browser worker setup (used in dev mode)                         |
| `client/src/mocks/server.ts`         | MSW node server setup (used in Vitest tests)                        |
| `client/src/main.tsx`                | Conditionally starts MSW in development mode                        |
| `client/public/mockServiceWorker.js` | Generated service worker file (created by `npx msw init public/`)   |
| `swa-cli.config.json`                | SWA CLI configuration for local dev                                 |

### Adding or modifying mock data

Edit `client/src/mocks/handlers.ts` to change mock responses. The same handlers are shared between browser mocking (dev mode) and Vitest tests.

```typescript
// Example: Add a handler for a new endpoint
http.get(`${API_BASE}/applications/new-endpoint`, () => {
  return HttpResponse.json({ data: { ... }, error: null });
}),
```

### Limitations

- Data is static — changes (create, update, delete) are acknowledged but not persisted across page reloads
- File upload SAS tokens return mock URLs that won't accept real blob PUTs
- No real Cosmos DB queries — filtering, sorting, pagination are not fully simulated

### Common pitfall: 502 Bad Gateway

If you get a **502** on `/api/*` requests, SWA CLI is trying to proxy API calls to a backend server that isn't running. This happens when `apiDevserverUrl` or `apiLocation` is set in the SWA CLI config. The `mock` config in `swa-cli.config.json` deliberately omits these so that `/api/*` requests reach the browser where MSW intercepts them.

---

## Mode 2: Local Frontend + Live Azure Backend

**Frontend:** Vite dev server (local)
**Backend:** Azure Functions (deployed to Azure)
**Auth:** SWA CLI mock auth → real Function auth validation
**Database/Storage:** Azure Cosmos DB + Blob Storage (live)

### When to use

- Testing frontend against real API behaviour
- Verifying data flows end-to-end without deploying the frontend
- Debugging API integration issues

### How it works

1. The `VITE_API_URL` environment variable points the frontend to the deployed Azure Functions app.
2. SWA CLI proxies API calls to the remote Function App URL.
3. Auth: SWA CLI provides mock `x-ms-client-principal` headers. The Function App validates these headers — ensure the mock principal includes the `owner` role.

### Setup

```bash
# 1. Create a .env.development.local file in client/
cat > client/.env.development.local << 'EOF'
VITE_API_URL=https://func-jobtracker.azurewebsites.net
VITE_DISABLE_MSW=true
EOF

# 2. Start SWA CLI with the "live-api" config
npx swa start --config-name live-api

# Open http://localhost:4280
```

### Important: CORS

The Azure Function App must allow the local dev origin in its CORS settings. Add `http://localhost:4280` (SWA CLI default port) to the Function App's CORS allowed origins:

```bash
az functionapp cors add \
  --name func-jobtracker \
  --resource-group job-tracker-rg \
  --allowed-origins http://localhost:4280
```

Or configure it in the Azure Portal under Function App → API → CORS.

### Important: Auth headers

SWA CLI mock auth generates a `x-ms-client-principal` header. For the Function App to accept it, the mock user must have the `owner` role. When SWA CLI prompts for mock auth details:

- **Username:** your GitHub username
- **User ID:** any value
- **Roles:** `authenticated,owner`

### Disabling MSW for this mode

The `.env.development.local` setup above includes `VITE_DISABLE_MSW=true`, which tells `main.tsx` to skip starting the MSW browser worker. This ensures API calls go through to the real Azure Functions backend instead of being intercepted by mock handlers.

If you forget this flag, MSW will intercept `/api/*` requests and return mock data even though a real backend is available.

---

## Mode 3: Live in Azure (Production)

**Frontend:** Azure Static Web Apps
**Backend:** Azure Functions (Consumption plan)
**Auth:** SWA built-in GitHub provider
**Database/Storage:** Azure Cosmos DB + Blob Storage

### When to use

- Production deployment
- Sharing the app with others
- Final testing before showcase

### Architecture

```
Browser
  │
  ├─ Static assets ──→ Azure Static Web Apps (gray-rock-0c358e300.azurestaticapps.net)
  │                     └─ Built-in GitHub auth (/.auth/login/github)
  │
  └─ API calls ──────→ Azure Functions (func-jobtracker.azurewebsites.net)
                        ├─ Cosmos DB (cosmos-jobtracker.documents.azure.com)
                        ├─ Blob Storage (stjobtrackermliokt.blob.core.windows.net)
                        └─ Event Grid (blob upload → processUpload trigger)
```

### Prerequisites

- Azure CLI installed and authenticated (`az login`)
- SWA CLI installed (`npm i -g @azure/static-web-apps-cli`)
- Infrastructure deployed via Bicep (see Phase 1)

### Deploy infrastructure (if not already done)

```bash
az deployment group create \
  --resource-group job-tracker-rg \
  --template-file infra/main.bicep \
  --parameters infra/parameters.json
```

### Deploy the frontend

**Option A — SWA CLI (manual)**

```bash
# Build the frontend
cd client && npm run build

# Deploy to Azure Static Web Apps
swa deploy dist \
  --deployment-token <YOUR_SWA_DEPLOYMENT_TOKEN> \
  --env production
```

**Option B — GitHub Actions (automated)**

Push to the `main` branch. The GitHub Actions workflow (`.github/workflows/azure-static-web-apps.yml`) automatically builds and deploys the frontend to Azure Static Web Apps.

### Deploy the backend

```bash
# Build the Functions app
cd api && npm run build

# Deploy to Azure Functions
func azure functionapp publish func-jobtracker
```

### Configuration

**Frontend environment:** Set `VITE_API_URL` to the Function App URL before building:

```bash
# In client/.env.production
VITE_API_URL=https://func-jobtracker.azurewebsites.net
```

**SWA route configuration:** Create `client/public/staticwebapp.config.json`:

```json
{
  "routes": [
    { "route": "/api/*", "allowedRoles": ["owner"] },
    { "route": "/*", "allowedRoles": ["owner"] }
  ],
  "responseOverrides": {
    "401": {
      "redirect": "/.auth/login/github?post_login_redirect_uri=.referrer",
      "statusCode": 302
    }
  },
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*", "/mockServiceWorker.js"]
  },
  "globalHeaders": {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://func-jobtracker.azurewebsites.net https://stjobtrackermliokt.blob.core.windows.net"
  }
}
```

> **Note:** The SWA route rules for `/api/*` only apply to linked backends. Since this project uses a standalone Function App (SWA Free tier limitation), API auth is enforced at the Function level via `x-ms-client-principal` header validation.

### Verifying the deployment

```bash
# Check SWA is serving the frontend
curl -I https://gray-rock-0c358e300.azurestaticapps.net

# Check Function App health
curl https://func-jobtracker.azurewebsites.net/api/applications \
  -H "x-ms-client-principal: <base64-encoded-principal>"

# Check Cosmos DB connectivity (via Function logs)
az functionapp log tail --name func-jobtracker --resource-group job-tracker-rg
```

---

## Quick Reference

| Aspect             | Mode 1: Full Mock   | Mode 2: Local + Live API                    | Mode 3: Production       |
| ------------------ | ------------------- | ------------------------------------------- | ------------------------ |
| **Frontend**       | Vite dev server     | Vite dev server                             | Azure Static Web Apps    |
| **Backend**        | MSW (in-browser)    | Azure Functions (remote)                    | Azure Functions (remote) |
| **Auth**           | SWA CLI mock        | SWA CLI mock                                | SWA built-in GitHub      |
| **Database**       | In-memory mocks     | Azure Cosmos DB                             | Azure Cosmos DB          |
| **Storage**        | Mock SAS tokens     | Azure Blob Storage                          | Azure Blob Storage       |
| **URL**            | `localhost:4280`    | `localhost:4280`                            | `*.azurestaticapps.net`  |
| **Start command**  | `npx swa start --config-name mock` | `npx swa start --config-name live-api` | Deployed via CI/CD       |
| **Use case**       | UI development      | Integration testing                         | Production               |
| **Requires Azure** | No                  | Yes (Functions + DB)                        | Yes (all resources)      |

---

## Troubleshooting

### Port conflicts

SWA CLI defaults to port 4280. If it's in use, it picks a random port. Check the terminal output for the actual URL.

```bash
# Kill processes on a specific port (Windows)
netstat -ano | findstr :4280
taskkill /PID <pid> /F
```

### MSW not intercepting requests

- Verify `mockServiceWorker.js` exists in `client/public/`
- Regenerate if missing: `cd client && npx msw init public/ --save`
- Check browser DevTools → Application → Service Workers — MSW worker should be active
- Check the console for `[MSW] Mocking enabled` message

### SWA CLI mock auth not working

- Ensure you're accessing the app via the SWA CLI URL (`localhost:4280`), not the Vite URL (`localhost:5173`)
- The mock login page is at `/.auth/login/github` — SWA CLI intercepts this route
- Set roles to `authenticated,owner` when prompted

### VITE_API_URL not taking effect

- Environment files are loaded by Vite at build/dev start time — restart Vite after changing `.env` files
- Only variables prefixed with `VITE_` are exposed to client code
- Precedence: `.env.development.local` > `.env.development` > `.env.local` > `.env`
