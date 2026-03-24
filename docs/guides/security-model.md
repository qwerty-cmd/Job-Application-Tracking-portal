# Security Model — Plain English Guide

This document explains how the app is secured and what each security control actually does. Written to be accessible without deep security knowledge.

---

## 1. Authentication — "Who is allowed to use the app?"

**The short version:** Only your GitHub account can log in. Every API call checks this before doing anything else.

**How it works:**

Azure Static Web Apps handles the login flow. When you sign in with GitHub, SWA creates a session and attaches a header called `x-ms-client-principal` to every request you make. This header contains your identity and your roles.

You have been granted the `owner` role — no one else has it.

Every API endpoint (Azure Function) starts with this check:

```typescript
const authResult = requireOwner(request);
if (authResult) return authResult; // stops here — returns 401 or 403
```

- **401 Unauthorized** — no valid session (not logged in)
- **403 Forbidden** — logged in but missing the `owner` role

This check runs *before* any database query or business logic. If it fails, nothing else runs.

**Why this matters:** The Function App URL is public on the internet. Without auth on every endpoint, anyone who found the URL could read or modify your data. Auth is enforced at the Function level rather than at the SWA gateway because SWA Free tier doesn't support linked backends.

**What about `processUpload`?** This is an Event Grid trigger, not an HTTP endpoint. It has no URL — it can only be invoked by Azure's Event Grid service when a blob is created. It's not callable by a browser or API client.

---

## 2. File Upload Tokens (SAS Tokens) — "How are file uploads kept secure?"

**The short version:** Files upload directly from your browser to Azure Blob Storage, bypassing the server. But they can only do so using a short-lived, tightly scoped token issued by the server.

**The flow:**

1. Your browser asks the server: "I want to upload a resume for application `abc-123`"
2. The server checks you're the owner, validates the file type and app ID, then generates a **SAS token** — a signed URL
3. Your browser uses that URL to PUT the file directly to Blob Storage
4. The token expires in 5 minutes and only works for that one specific blob

**What the tokens can and can't do:**

| Token type | Can do | Can't do |
|---|---|---|
| Upload token | Create and write to one specific blob | Read, delete, or access any other blob |
| Download token | Read one specific blob | Write, delete, or access any other blob |

**Why short-lived and single-blob?** If a token were somehow intercepted, the damage is limited. It can't be used to access any other file, and it stops working in 5 minutes.

**Validation before any token is issued:**
- The application must exist and not be soft-deleted
- The file type must be `resume`, `coverLetter`, or `jobDescription`
- The file extension must be valid for that type (`.pdf`, `.docx`, or `.html` for job descriptions only)
- The `contentType` must match the file extension

---

## 3. CORS — "Which websites can talk to Storage and the API?"

**The short version:** Only your deployed app's URL is allowed to make requests to Blob Storage or the API. No other website can.

**What CORS is:** Browsers enforce a rule called Cross-Origin Resource Sharing. By default, a browser won't let `site-a.com` make requests to `site-b.com` unless `site-b.com` explicitly allows it.

**The configuration:**

- **Blob Storage** only accepts `PUT`, `GET`, and `HEAD` requests from `https://gray-rock-0c358e300.1.azurestaticapps.net` (your SWA hostname)
- **The Function App** only accepts requests from the same SWA hostname
- No wildcard origins (`*`) anywhere — wildcards would allow any website to make requests

**Why this is defined in Bicep:** CORS is infrastructure config. Keeping it in the Bicep template means it's version-controlled, reproducible, and not dependent on someone remembering to set it correctly in the Azure portal.

---

## 4. File Validation (processUpload) — "What happens after a file is uploaded?"

**The short version:** After a file lands in Blob Storage, a server-side function validates it before linking it to your application record. Multiple layers of checks run.

**Why this is needed:** The browser upload goes directly to Blob Storage — the server doesn't see the file contents during the upload. `processUpload` runs asynchronously after the upload completes, triggered by an Event Grid event.

**The checks, in order:**

### File size check
Reads the blob's metadata and checks `contentLength`. If the file is over 10 MB, the blob is deleted immediately and processing stops. The Cosmos DB record is never updated.

### Magic bytes check
Reads the **first 16 bytes** of the file and checks for known file signatures:

| File type | Expected signature | What it looks like in bytes |
|---|---|---|
| PDF | `%PDF` | `25 50 44 46` |
| DOCX | `PK` (ZIP format) | `50 4B 03 04` |
| HTML | `<!doctype` or `<html` | — |

**Why this matters:** File extensions are trivially fakeable. Anyone can rename `malware.exe` to `resume.pdf`. Reading the actual bytes confirms the file content matches what was claimed. If the check fails, the blob is deleted and Cosmos is not updated.

### Soft-delete check
If the application was soft-deleted between when the SAS token was issued and when the upload completed, the upload is silently ignored. The orphaned blob is eventually cleaned up by the storage lifecycle policy (90-day TTL).

### "Latest wins" check
If two uploads of the same file type happen in quick succession, the one with the older timestamp is ignored. Only the newest upload is linked to the application.

### Retry safety (idempotency)
Event Grid may deliver the same event more than once if the function previously failed. `processUpload` handles this gracefully — "blob not found" on old blob deletion is treated as success, not an error.

---

## 5. Summary

| Area | Control | What it prevents |
|---|---|---|
| API auth | `requireOwner()` on all 15 HTTP Functions | Unauthorized access to your data |
| Event Grid isolation | `processUpload` has no HTTP route | Can't be triggered externally |
| Upload token scope | Create+write, single blob, 5 min | Token misuse beyond the intended upload |
| Download token scope | Read-only, single blob, 5 min | Token misuse for writes or other files |
| CORS | SWA hostname only, no wildcards | Other websites can't call your API or storage |
| File size | Checked server-side in processUpload | Storage bloat and cost |
| Magic bytes | Checked server-side in processUpload | Disguised malicious file uploads |

The overall approach is **defence in depth** — multiple independent layers, so no single misconfiguration opens a wide hole.
