---
description: "Full security and consistency review of the codebase against CLAUDE.md design docs."
agent: "reviewer"
---
Perform a full review of the codebase:

1. Read [CLAUDE.md](../../CLAUDE.md) for the authoritative design decisions, API contract, and validation rules
2. Review all files in `api/functions/` and `api/shared/` for:
   - Security vulnerabilities (OWASP Top 10)
   - Consistency with CLAUDE.md (response shapes, status codes, validation rules)
   - Edge case handling (race conditions, soft-delete checks, idempotency)
   - SAS token security (scope, expiry, permissions)
3. Check `infra/` Bicep templates for:
   - CORS configuration (SWA origin only)
   - Event Grid filtering (BlobCreated only)
   - Dead-letter container wiring
   - Lifecycle policy (90-day TTL)
4. Report all findings grouped by severity (CRITICAL / HIGH / MEDIUM / LOW)
