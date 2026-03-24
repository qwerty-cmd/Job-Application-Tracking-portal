# Phase 5 — CI/CD & Deployment: Challenges & Resolutions

**Date:** 2026-03-23 to 2026-03-24
**Phase:** 5 — CI/CD & Deployment
**Scope:** Implement GitHub Actions workflows for frontend (SWA) and backend (Functions), configure secrets, run first production deployments, execute smoke tests

---

## Challenge 1: Deploy Jobs Triggering on PRs to Non-Main Branches

**Symptom:** Initial workflow drafts had deploy jobs that could run on any push or PR, meaning a PR from a feature branch could attempt a production deployment.

**Root Cause:** The deploy job conditions were not correctly scoped. A naive `if: github.event_name == 'push'` check doesn't account for `workflow_dispatch` runs from non-main branches, and doesn't prevent accidental deploys from PR workflows.

**Resolution:** Updated the deploy job conditions in both workflows to only deploy when:

- The trigger is a `push` to `main`, **or**
- The trigger is a `workflow_dispatch` with the ref pointing to `main`

```yaml
# azure-static-web-apps.yml and azure-functions.yml
deploy:
  needs: quality-gates
  if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')
```

**Lesson:** GitHub Actions `workflow_dispatch` does not automatically restrict to `main`. If you allow manual triggers, you must also guard the deploy job with an explicit `github.ref` check, otherwise any branch can be manually deployed to production.

---

## Challenge 2: All 4 Secrets Required Before First Run Could Succeed

**Symptom:** Both workflows fail at the deploy step on first run. Quality gates (test + build) pass fine, but the deploy jobs fail with authentication or missing variable errors.

**Root Cause:** GitHub Actions secrets must exist in the repository before the workflow runs that consume them. The secrets needed are:

| Secret | Used By | How to Get It |
|--------|---------|---------------|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | SWA deploy action | Azure Portal → Static Web App → Manage deployment token |
| `VITE_API_URL` | Frontend build (`npm run build`) | Azure Portal → Function App → URL |
| `VITE_APPINSIGHTS_CONNECTION_STRING` | Frontend build | Azure Portal → Application Insights → Connection String |
| `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` | Functions deploy action | Azure Portal → Function App → Get publish profile (download XML) |

**Resolution:** All 4 secrets were configured in GitHub → Settings → Secrets and variables → Actions before triggering the first `workflow_dispatch` run.

**Lesson:** Map out every secret a workflow needs before writing the workflow. Attempting a deploy without them results in cryptic authentication failures rather than a clear "secret not found" message. For reference, see [docs/plans/cicd-secrets-checklist.md](../plans/cicd-secrets-checklist.md).

---

## Challenge 3: Route Conflict — `{id}` Parameter Capturing Literal Paths

**Symptom:** After first successful deployment, two API routes returned unexpected 404s:

- `GET /api/applications/stats` → `{ error: { message: "Application stats not found" } }`
- `GET /api/applications/deleted` → `{ error: { message: "Application deleted not found" } }`

The dashboard was broken (no stats loaded) and the deleted applications page was empty with a 404 error.

**Root Cause:** Azure Functions resolves route conflicts at the **host level**, not by function registration order. The `getApplication` function had the route:

```
applications/{id}
```

The Azure Functions host matched `applications/stats` and `applications/deleted` against this parameterized route, treating `stats` and `deleted` as values for `{id}`. It then passed them to the `getApplication` handler, which did a Cosmos DB point read for a document with `id = "stats"` (or `"deleted"`), found nothing, and returned 404.

The `getStats` and `listDeleted` functions had their own literal routes (`applications/stats`, `applications/deleted`), but those **never executed** because the host had already matched the request to `getApplication`.

This is counterintuitive: even though `getStats` and `listDeleted` are registered with more specific routes, Azure Functions gives no guarantee that literal routes win over parameterized routes when they share the same prefix. Registration order in code has no effect.

**Resolution:** Constrained the `{id}` parameter to only match valid GUIDs using the `:guid` route constraint:

```typescript
// Before
app.http("getApplication", {
  methods: ["GET"],
  route: "applications/{id}",
  handler: getApplication,
});

// After
app.http("getApplication", {
  methods: ["GET"],
  route: "applications/{id:guid}",
  handler: getApplication,
});
```

With this constraint, the Azure Functions host rejects any value for `{id}` that is not a valid GUID (e.g. `"stats"`, `"deleted"`), and falls through to evaluate the next matching route — which correctly resolves to `getStats` or `listDeleted`.

**Deployed via:** commit `49e403f`

**Lesson:** In Azure Functions, **never rely on registration order** to resolve conflicts between parameterized and literal routes. If a parameterized segment (`{id}`) can match a literal path segment that another route uses (`stats`, `deleted`), it will — and the literal route will never fire. Use route constraints (`:guid`, `:int`, `:alpha`, etc.) to restrict what a parameter can match, so the runtime can correctly distinguish the two routes.

**Azure Functions route constraint reference:**

| Constraint | Example | Matches |
|-----------|---------|---------|
| `:guid` | `{id:guid}` | Only valid GUIDs (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) |
| `:int` | `{page:int}` | Only integers |
| `:alpha` | `{name:alpha}` | Only alphabetic characters |
| `:bool` | `{flag:bool}` | Only `true` or `false` |
| `:double` | `{price:double}` | Only floating-point numbers |
| `:long` | `{id:long}` | Only long integers |

These are ASP.NET Core route constraints reused by the Azure Functions host.

---

## Summary

| # | Challenge | Category | Severity | Caught At |
|---|-----------|----------|----------|-----------|
| 1 | Deploy jobs not gated to `main` branch | Workflow config | Medium | Code review / planning |
| 2 | All 4 secrets required before first run | Secret management | Medium | First deploy attempt |
| 3 | `{id}` route capturing `stats` and `deleted` | Azure Functions routing | **Critical** | Post-deploy smoke test |

### Key Takeaways

1. **Always gate deploy jobs on `github.ref == 'refs/heads/main'`.** `workflow_dispatch` does not imply main — add the ref check explicitly.

2. **Inventory secrets before writing workflows.** Know what every secret is, where to get it in Azure, and confirm it's added to GitHub before triggering a deploy.

3. **Use route constraints whenever a parameterized segment shares a prefix with literal routes.** `{id:guid}` instead of `{id}` is a one-word change that prevents an entire class of routing bugs in Azure Functions. Make this a default when the ID is a GUID.

4. **Smoke test immediately after first deploy.** The route conflict was invisible in local testing (Functions Core Tools resolves routes differently) and only appeared in production. A smoke test checklist that explicitly exercises every page — including stats and deleted — caught it within minutes.
