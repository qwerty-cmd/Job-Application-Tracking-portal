# V3: AI Analysis

## Goal

Add AI-powered career coaching to the app. The AI analyzes the user's application history, interview feedback, and rejection patterns to surface actionable suggestions for improving their job search.

---

## Analysis Types

| Type | Trigger | Input |
|------|---------|-------|
| Profile overview | "Analyze my job search" on Dashboard | All active applications, status distribution, interview outcomes |
| Interview feedback patterns | "Get AI feedback" on Application Detail (interviews section) | Interview notes, reflections, outcomes across all rounds |
| Rejection analysis | "Get AI feedback" on Application Detail (rejection section) | Rejection reasons, notes, interview history for that application |

---

## Architecture

### Backend — New Azure Function

**Endpoint:** `POST /api/ai/analyze`

**Auth:** `requireOwner()` — owner only, this is real personal data

**Request body:**
```json
{
  "type": "profile" | "interview-patterns" | "rejection-analysis",
  "applicationId": "uuid"  // required for interview-patterns and rejection-analysis
}
```

**Response:**
```json
{
  "data": {
    "summary": "string",
    "suggestions": ["string"],
    "cachedAt": "ISO timestamp"
  },
  "error": null
}
```

**Logic:**
1. Validate request and auth
2. Fetch relevant documents from Cosmos
3. Build a structured prompt
4. Call Anthropic API
5. Return response (and optionally cache it in the Cosmos document)

### Model Choice

- `claude-haiku-4-5-20251001` — for quick, cost-efficient analysis (recommended default)
- `claude-sonnet-4-6` — for deeper profile-level review (optional upgrade, higher cost)

### Cost Control

Cache the AI response in the Cosmos document under an `aiAnalysis` field:

```json
{
  "aiAnalysis": {
    "type": "interview-patterns",
    "summary": "...",
    "suggestions": ["..."],
    "cachedAt": "2026-04-01T12:00:00Z"
  }
}
```

- Return cached response if `cachedAt` is less than 24 hours old
- Invalidate cache on any `PATCH` to the document (application updated = re-analyze)
- Profile-level analysis is not cached per-document; cache in a separate Cosmos item or a short-lived in-memory cache in the Function

---

## Frontend

### Dashboard — Profile Analysis

- New "AI Insights" card or section below the summary cards
- "Analyze my job search" button
- Loading state while waiting for the Function response
- Output: summary paragraph + bulleted suggestions

### Application Detail — Per-Application Feedback

- Button in the Interviews section: "Get AI coaching tips"
- Button in the Rejection section: "Get AI feedback on this rejection"
- Inline panel below the relevant section showing the analysis
- Re-analyze button to refresh (clears cache and re-calls)

---

## Prompt Design (illustrative)

**Profile overview prompt:**
```
You are a career coach reviewing a job seeker's application history.

Applications submitted: {total}
Status breakdown: {byStatus}
Interview conversion rate: {interviews/applications}%
Rejection reasons: {rejectionReasons}

Identify 3–5 specific, actionable improvements the candidate can make to their job search strategy. Be direct and practical. Format as a brief summary followed by a bulleted list.
```

**Interview feedback prompt:**
```
You are a career coach reviewing interview feedback.

Role: {role} at {company}
Interview rounds:
{rounds with type, outcome, notes, reflection}

Based on the notes and outcomes, identify patterns and give 3–5 specific coaching suggestions to improve future interview performance.
```

---

## New Infrastructure Required

- **Anthropic API key** stored as a Function App environment variable: `ANTHROPIC_API_KEY`
- Add `ANTHROPIC_API_KEY` to GitHub Actions secrets for CI/CD deployment
- Add `@anthropic-ai/sdk` to `api/package.json`

No new Azure resources needed.

---

## Demo Mode Behaviour

In demo mode (MSW active), the `POST /api/ai/analyze` handler returns pre-written canned analysis responses seeded in `handlers.ts`. Optionally show a subtle note: "AI analysis uses live data — available after signing in."

---

## Out of Scope for V3

- CV/resume parsing or file content analysis (would require document extraction pipeline)
- Real-time streaming responses (nice to have, can add later)
- Analysis for other users / multi-tenancy
