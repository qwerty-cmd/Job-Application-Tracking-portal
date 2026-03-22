# Logging Improvement Plan

**Created:** 2026-03-22
**Implementation date:** 2026-03-22
**Status:** ✅ Complete — all items implemented and verified.

---

## Implementation Status

| Item    | Description                       | Status  | Notes                                                                                                                                   |
| ------- | --------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **B-1** | Structured Logger Utility         | ✅ Done | `api/src/shared/logger.ts` — `createLogger()`, `serializeError()`                                                                       |
| **B-2** | Error Logging in All 16 Functions | ✅ Done | All catch blocks now log with `serializeError(err)` + duration                                                                          |
| **B-3** | Request Lifecycle Logging         | ✅ Done | Start (method/url/params) + error duration in all; full request-completed in key functions                                              |
| **B-4** | Auth Event Logging                | ✅ Done | `auth.ts` accepts optional `Logger`, logs missing/invalid roles                                                                         |
| **B-5** | Cosmos RU Tracking                | ✅ Done | All 16 functions instrumented with `requestCharge` destructuring + `trackMetric("CosmosRequestCharge", ...)`                            |
| **B-6** | Blob Storage Logging              | ✅ Done | All blob operations logged: processUpload, uploadSasToken (SAS generation), downloadSasToken (SAS generation), deleteFile (blob delete) |
| **B-7** | host.json Log Levels              | ✅ Done | Updated with recommended log levels and sampling config                                                                                 |
| **B-8** | App Insights SDK (backend)        | ✅ Done | `applicationinsights` installed, `telemetry.ts` with `initTelemetry()`, `trackEvent()`, `trackMetric()`                                 |
| **B-9** | Business Custom Events            | ✅ Done | 8 events tracked: ApplicationCreated, StatusChanged, InterviewAdded, Deleted, Restored, UploadSasIssued, FileUploaded, FileDeleted      |
| **F-1** | App Insights Browser SDK          | ✅ Done | `@microsoft/applicationinsights-web` in `client/src/lib/appInsights.ts`                                                                 |
| **F-2** | Frontend Logger Service           | ✅ Done | `client/src/lib/logger.ts` — dual console + App Insights output                                                                         |
| **F-3** | Error Boundary                    | ✅ Done | `client/src/components/ErrorBoundary.tsx`, wraps `<App>` in `main.tsx`                                                                  |
| **F-4** | API Client Logging                | ✅ Done | Slow call warning (>2s), non-JSON error, network error logging                                                                          |
| **F-5** | Auth Context Logging              | ✅ Done | Auth check result + `SessionStarted` custom event                                                                                       |
| **F-6** | Mutation Hook Logging             | ✅ Done | All mutation errors, file upload lifecycle, XHR errors                                                                                  |
| **F-7** | User Action Tracking              | ✅ Done | PageViewed events, CRUD events, file events, interview events                                                                           |

---

## Files Created

| File                                      | Purpose                                                  |
| ----------------------------------------- | -------------------------------------------------------- |
| `api/src/shared/logger.ts`                | Structured JSON logger wrapping `InvocationContext`      |
| `api/src/shared/telemetry.ts`             | App Insights SDK init + `trackEvent()` / `trackMetric()` |
| `client/src/lib/appInsights.ts`           | App Insights browser SDK initialization                  |
| `client/src/lib/logger.ts`                | Frontend logger (console + App Insights dual output)     |
| `client/src/components/ErrorBoundary.tsx` | React error boundary with crash logging                  |

## Files Modified

| File                                    | Changes                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| `api/src/shared/auth.ts`                | Added optional `Logger` param; logs auth failures at WARN |
| `api/src/index.ts`                      | Added `initTelemetry()` call at startup                   |
| `api/host.json`                         | Updated log levels and sampling config                    |
| `api/local.settings.json`               | Added `APPLICATIONINSIGHTS_CONNECTION_STRING`             |
| `api/src/functions/*/index.ts` (all 16) | Logger, error logging, lifecycle logging, telemetry       |
| `client/src/main.tsx`                   | `initAppInsights()` + `<ErrorBoundary>` wrapper           |
| `client/src/lib/api.ts`                 | Request timing, slow call warnings, error logging         |
| `client/src/contexts/AuthContext.tsx`   | Auth check logging, SessionStarted event                  |
| `client/src/hooks/useMutations.ts`      | Mutation errors, file upload/download/delete events       |
| `client/src/App.tsx`                    | PageViewed event on route changes                         |

---

## Issues Encountered During Implementation

### 1. Bulk Edit Formatting Corruption

**Problem:** PowerShell `-replace` operator inserted literal `\`r\`n` escape sequences into TypeScript files instead of actual newlines when used to bulk-edit all 16 function handlers.

**Impact:** 12+ files corrupted with broken TypeScript syntax.

**Fix:** Replaced all corrupted sequences using PowerShell here-strings (`@'...'@` / `@"..."@`) which handle newlines correctly. Each affected file was individually repaired and verified.

**Lesson:** Use file-level edits (one at a time) instead of bulk regex substitution for multi-line code changes.

### 2. processUpload Received HTTP-Style Logging

**Problem:** The bulk edit applied HTTP request logging (`req.method`, `req.url`) to the processUpload Event Grid trigger function, which has no `req` parameter — it receives an `EventGridEvent`.

**Impact:** TypeScript compilation error. processUpload handler wouldn't compile.

**Fix:** Manually replaced HTTP-style logging with event-style logging:

```typescript
// Before (broken — req doesn't exist)
log.info("Request started", { method: req.method, url: req.url });

// After (correct — uses event metadata)
log.info("Event received", {
  eventType: event.eventType,
  subject: event.subject,
});
```

### 3. `setAutoCollectPerformance()` Argument Count

**Problem:** `applicationinsights` Node.js SDK's `setAutoCollectPerformance()` requires 2 arguments: `(enabled, enableLiveMetrics)`. Called with 1 argument → TypeScript error.

**Fix:** Changed `setAutoCollectPerformance(true)` to `setAutoCollectPerformance(true, false)`.

### 4. App Insights Browser SDK `trackTrace`/`trackException` Signatures

**Problem:** The browser SDK's `trackTrace()` and `trackException()` methods don't accept `properties` inside the telemetry object. Custom properties must be passed as the second argument.

**Impact:** TypeScript compilation error: "Expected 2 arguments, but got 1" (the SDK overload expects `(telemetry, customProperties?)` but properties were embedded in the first arg).

**Fix:** Extracted `customProps` and switched to the two-argument form:

```typescript
// Before (broken)
appInsights?.trackTrace({ message, severityLevel: 1, properties: customProps });

// After (correct — two-argument form)
appInsights?.trackTrace({ message, severityLevel: 1 }, customProps);
```

### 5. Test Output Noise from Frontend Logger

**Problem:** `logger.info()` and `logger.event()` calls in components produced excessive `console.info` output during Vitest runs, flooding test output with hundreds of structured log entries.

**Fix:** Added test-mode guard at the top of the logger:

```typescript
const isTestMode = import.meta.env.MODE === "test";
```

Console output for `info` and `event` levels is suppressed when `isTestMode` is true. `warn` and `error` still output (important for test debugging).

---

## Implementation Patterns Applied

### Backend — Per-Function Pattern

Every HTTP function handler follows this pattern after instrumentation:

```typescript
import { createLogger, serializeError } from "../../shared/logger.js";
import { trackEvent, trackMetric } from "../../shared/telemetry.js";

async function handler(req: HttpRequest, context: InvocationContext) {
  const log = createLogger(context); // 1. Create logger
  const startedAt = Date.now(); // 2. Start timer

  log.info("Request started", {
    // 3. Log request metadata
    method: req.method,
    url: req.url,
    routeParams: req.params,
    contentLength: req.headers.get("content-length"),
  });

  const authError = requireOwner(req, log); // 4. Auth with logger
  if (authError) return authError;

  try {
    // ... business logic ...

    // 5. Track Cosmos RU (in functions with Cosmos calls)
    const { resource, requestCharge } = await getContainer()
      .item(id, id)
      .read();
    trackMetric("CosmosRequestCharge", requestCharge ?? 0);
    log.info("Cosmos read", {
      operation: "read",
      partitionKey: id,
      requestCharge,
    });

    // 6. Track business event (in key functions)
    trackEvent("ApplicationCreated", { applicationId: id, company, role });

    // 7. Log request completed (in key functions)
    log.info("Request completed", {
      status: 200,
      durationMs: Date.now() - startedAt,
    });
    return successResponse(resource);
  } catch (err) {
    // 8. Log error with serialization + duration
    log.error("Unhandled error", {
      error: serializeError(err),
      durationMs: Date.now() - startedAt,
    });
    return serverError();
  }
}
```

### Backend — Event Grid Trigger Pattern (processUpload)

```typescript
async function processUpload(
  event: EventGridEvent,
  context: InvocationContext,
) {
  const log = createLogger(context);
  const startedAt = Date.now();
  log.info("Event received", {
    eventType: event.eventType,
    subject: event.subject,
  });

  try {
    // ... processing logic with per-step logging ...
    log.info("Event processed", {
      durationMs: Date.now() - startedAt,
      applicationId,
      fileType,
    });
  } catch (err) {
    log.error("Unhandled processUpload error", {
      error: serializeError(err),
      durationMs: Date.now() - startedAt,
    });
    throw err; // Re-throw for Event Grid retry
  }
}
```

### Frontend — Logger API

```typescript
import { logger } from "@/lib/logger";

// Levels (console + App Insights)
logger.info("Context loaded", { userId }); // console.info (dev only) + trackTrace(severity=1)
logger.warn("Slow API call", { url, durationMs }); // console.warn + trackTrace(severity=2)
logger.error("Network error", { url, message }); // console.error + trackException

// Custom events (App Insights only + dev console)
logger.event("ApplicationCreated", { company }); // trackEvent + console.info (dev only)
```

---

## Verification

After implementation, all builds and tests pass:

- **Backend:** `npm run build` clean, 266/266 tests passing (16 test files)
- **Frontend:** `npm run build` clean, 55/55 tests passing (6 test files)
- **Zero TypeScript errors** across both projects

---

## Original State

The sections below document the original state of the codebase before instrumentation and the detailed plan for each item.

## Current State

### Backend (api/)

- **15 of 16 Azure Functions have zero logging.** All catch blocks silently return `serverError()` with no diagnostic output.
- **Only `processUpload`** has 9 `context.log()` calls (the Event Grid trigger).
- **No Application Insights SDK** installed (`applicationinsights` npm package missing) — despite `host.json` having App Insights sampling config.
- **No `APPLICATIONINSIGHTS_CONNECTION_STRING`** in `local.settings.json`.
- **No structured logging** — no correlation IDs, no request context, no log levels.
- **`auth.ts`** catch block is empty — failed auth decoding is completely silent.

### Frontend (client/)

- **Zero logging infrastructure.** No `console.error`, no telemetry, no error tracking.
- **No Application Insights browser SDK** installed.
- **No Error Boundary component** — React render crashes produce a blank screen.
- **`lib/api.ts`** catch block silently returns `networkError()` — no logging.
- **All mutation hooks** store errors in state but never log them.
- **Auth context** catch block is silent — auth failures produce no output.
- **Toast notifications** show errors to the user but nothing is recorded.

---

## Plan — Backend

### B-1: Structured Logger Utility

**File:** `api/src/shared/logger.ts`

Create a logging helper wrapping `context.log` / `context.error` / `context.warn` with:

- **Structured JSON output** — App Insights parses structured logs into queryable fields.
- Fields: `timestamp`, `level`, `functionName`, `invocationId`, `message`, `properties`.
- Consistent `correlationId` from `context.invocationId`.
- Auto-include `applicationId`, `interviewId`, etc. from request params.

```typescript
// Example API
const log = createLogger(context);
log.info("Processing request", { applicationId, status });
log.warn("Auth failed — missing owner role", { userId });
log.error("Cosmos write failed", { error, applicationId });
```

### B-2: Error Logging in All 15 Silent Functions

Every function's catch block currently does:

```typescript
catch {
  return serverError();
}
```

Change to:

```typescript
catch (err) {
  log.error("Unhandled error", { error: err });
  return serverError();
}
```

**Affected files (15):**

| Function           | File                                            |
| ------------------ | ----------------------------------------------- |
| createApplication  | `api/src/functions/createApplication/index.ts`  |
| getApplication     | `api/src/functions/getApplication/index.ts`     |
| listApplications   | `api/src/functions/listApplications/index.ts`   |
| updateApplication  | `api/src/functions/updateApplication/index.ts`  |
| deleteApplication  | `api/src/functions/deleteApplication/index.ts`  |
| restoreApplication | `api/src/functions/restoreApplication/index.ts` |
| listDeleted        | `api/src/functions/listDeleted/index.ts`        |
| getStats           | `api/src/functions/getStats/index.ts`           |
| addInterview       | `api/src/functions/addInterview/index.ts`       |
| updateInterview    | `api/src/functions/updateInterview/index.ts`    |
| deleteInterview    | `api/src/functions/deleteInterview/index.ts`    |
| reorderInterviews  | `api/src/functions/reorderInterviews/index.ts`  |
| uploadSasToken     | `api/src/functions/uploadSasToken/index.ts`     |
| downloadSasToken   | `api/src/functions/downloadSasToken/index.ts`   |
| deleteFile         | `api/src/functions/deleteFile/index.ts`         |

### B-3: Request Lifecycle Logging

At the **start** of every function handler, log:

- Function name, HTTP method, route params
- Authenticated user (from `x-ms-client-principal`)
- Request body size

At the **end** (before return), log:

- Response status code
- Duration (ms)
- Key entity IDs involved

### B-4: Auth Event Logging

**File:** `api/src/shared/auth.ts`

- Log failed auth attempts (missing header, invalid base64, missing owner role) at WARN level.
- Log the catch block that currently silently returns `null`.
- Include `identityProvider`, `userId` (but not full `userDetails` for privacy).

### B-5: Cosmos Operation Logging

In each function's Cosmos calls, log:

- Operation type (read, create, replace, query)
- Partition key used
- **Request charge (RU)** from response headers — critical for cost monitoring
- Latency of the Cosmos call

### B-6: Blob Storage Operation Logging

In `uploadSasToken`, `downloadSasToken`, `deleteFile`, `processUpload`:

- SAS token generated (file type, application ID, expiry)
- Blob download/delete operations
- Blob size for uploads

### B-7: Enhance host.json Logging Configuration

```json
{
  "logging": {
    "logLevel": {
      "default": "Information",
      "Host.Results": "Error",
      "Function": "Information",
      "Host.Aggregator": "Trace"
    },
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "maxTelemetryItemsPerSecond": 20,
        "excludedTypes": "Request"
      }
    }
  }
}
```

### B-8: Wire Application Insights SDK

- Install `applicationinsights` npm package.
- Auto-collect dependencies (Cosmos, Blob HTTP calls) — gives query-level traces.
- Track custom events for business metrics.
- Add `APPLICATIONINSIGHTS_CONNECTION_STRING` to `local.settings.json` and Bicep app settings.

### B-9: Business-Level Custom Events

Track key user actions as custom App Insights events:

| Event Name                 | Properties                          |
| -------------------------- | ----------------------------------- |
| `ApplicationCreated`       | company, role, hasLocation          |
| `ApplicationStatusChanged` | oldStatus, newStatus, applicationId |
| `FileUploaded`             | fileType, fileSize, contentType     |
| `FileDeleted`              | fileType, applicationId             |
| `InterviewAdded`           | type, outcome                       |
| `ApplicationDeleted`       | applicationId                       |
| `ApplicationRestored`      | applicationId                       |

These power dashboards in App Insights without custom queries.

---

## Plan — Frontend

### F-1: Install Application Insights Browser SDK

- Install `@microsoft/applicationinsights-web`.
- Initialize in app entry point with connection string from env var (`VITE_APPINSIGHTS_CONNECTION_STRING`).
- Auto-tracks: page views, exceptions, dependencies (fetch calls), performance.

### F-2: Frontend Logger Service

**File:** `client/src/lib/logger.ts`

Centralized logger:

- **Development:** outputs to `console.warn` / `console.error` (not noisy `console.log`).
- **Production:** forwards to App Insights via `appInsights.trackException()` / `appInsights.trackEvent()`.
- Methods: `logger.info()`, `logger.warn()`, `logger.error()`, `logger.event()`.

### F-3: Error Boundary Component

**File:** `client/src/components/ErrorBoundary.tsx`

- Catches React render crashes.
- Logs error + component stack to App Insights.
- Shows a "Something went wrong" fallback UI with a retry button.
- Wraps `<App />` in `main.tsx`.

### F-4: API Client Logging

**File:** `client/src/lib/api.ts`

In the `request()` function:

- Log network errors (currently silent catch block).
- Log non-JSON responses.
- Log slow API calls (> 2 seconds) as warnings.
- Include request method, URL, duration, status code.

### F-5: Auth Context Logging

**File:** `client/src/contexts/AuthContext.tsx`

- Log auth check result (authenticated / owner / denied / error).
- Log auth failures in the catch block (currently silent).
- Track session start as a custom event.

### F-6: Mutation Hook Logging

**File:** `client/src/hooks/useMutations.ts`

- Log API errors returned by mutations (currently only stored in state).
- Log file upload progress milestones (start, complete, failed).
- Log upload XHR errors.

### F-7: User Action Tracking (Custom Events)

Track key UI interactions via App Insights custom events:

- Page navigations (application list → detail → dashboard)
- Application created / status changed
- File upload started / completed / failed
- Interview added / edited / deleted / reordered
- Filter applied / reset

---

## Implementation Priority

| Priority | Item                                        | Impact                                 | Effort |
| -------- | ------------------------------------------- | -------------------------------------- | ------ |
| **P0**   | B-1: Logger utility                         | Foundation for all backend logging     | Small  |
| **P0**   | B-2: Error logging in 15 functions          | Fixes blind spot for all server errors | Small  |
| **P0**   | B-4: Auth event logging                     | Security visibility                    | Small  |
| **P1**   | B-3: Request lifecycle logging              | Full request traceability              | Medium |
| **P1**   | B-8: App Insights SDK (backend)             | Auto dependency tracking               | Small  |
| **P1**   | F-1: App Insights SDK (frontend)            | Client-side telemetry                  | Small  |
| **P1**   | F-2: Frontend logger service                | Foundation for frontend logging        | Small  |
| **P1**   | F-3: Error boundary                         | Crash recovery + logging               | Small  |
| **P2**   | F-4: API client logging                     | Network error visibility               | Small  |
| **P2**   | B-5: Cosmos operation logging (RU tracking) | Cost visibility                        | Medium |
| **P2**   | F-5: Auth context logging                   | Auth flow visibility                   | Small  |
| **P2**   | F-6: Mutation hook logging                  | Error tracking                         | Small  |
| **P3**   | B-6: Blob storage logging                   | Upload pipeline visibility             | Small  |
| **P3**   | B-7: host.json log levels                   | Fine-grained control                   | Tiny   |
| **P3**   | B-9: Business custom events                 | Analytics dashboards                   | Medium |
| **P3**   | F-7: User action tracking                   | Usage analytics                        | Medium |

---

## What This Enables in App Insights / Log Analytics

Once implemented, you'll be able to query:

```kusto
// All errors in the last 24 hours
traces
| where severityLevel >= 3
| order by timestamp desc

// Cosmos RU consumption per function
customMetrics
| where name == "CosmosRequestCharge"
| summarize avg(value), max(value) by cloud_RoleName, operation_Name
| order by avg_value desc

// Failed auth attempts
traces
| where message contains "Auth failed"
| summarize count() by bin(timestamp, 1h)

// Slow API calls (> 2s)
requests
| where duration > 2000
| project timestamp, name, duration, resultCode

// File upload success/failure rate
customEvents
| where name == "FileUploaded" or name == "FileUploadFailed"
| summarize count() by name, bin(timestamp, 1d)

// Application status transitions
customEvents
| where name == "ApplicationStatusChanged"
| extend oldStatus = tostring(customDimensions.oldStatus),
         newStatus = tostring(customDimensions.newStatus)
| summarize count() by oldStatus, newStatus
```
