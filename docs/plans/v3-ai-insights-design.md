# V3: AI Insights — Design Document

## Overview

Add application-analysis insights to the job tracker in a way that stays effectively free by default, works on mobile, and can be upgraded later to a hosted LLM without changing the frontend contract.

The design for V1 is **rules-first**:

- compute structured metrics from the user's application history
- apply deterministic rules to detect patterns worth surfacing
- return concise coaching insights with evidence and confidence

The design for V2 is **LLM-assisted enrichment**:

- keep the rules engine as the source of truth
- optionally use a low-cost hosted model to rewrite or synthesize high-confidence findings into more natural coaching copy
- fall back to rules-only output when no provider is configured or budget limits are reached

This keeps the feature useful at zero AI spend while preserving a clear upgrade path.

**Status:** Draft design
**Scope:** Backend analysis engine + API contract + frontend surface plan

---

## Goals

- Provide useful analysis of job-search outcomes without requiring paid AI infrastructure
- Work consistently on desktop and mobile through the existing backend API
- Avoid overconfident or misleading advice when data is sparse or mixed
- Keep the response contract stable so an LLM layer can be added later without UI rewrites
- Make insights transparent by showing evidence and confidence, not just suggestions

## Non-goals

- Real-time chat with an AI assistant
- Resume or job-description file parsing in V1
- Automatic background analysis after every application change
- Fully personalized career advice from raw free-text alone
- Dependence on a paid hosted model for core functionality

---

## Product Positioning

This feature should be presented as **AI Insights** or **career coaching insights**, but the first version is not a pure LLM product. It is an analytics-and-recommendation system built from the user's actual application data.

That distinction matters because:

- it keeps the feature free to run
- it is easier to test and trust
- it avoids hallucinated advice on low-quality data
- it creates a safer foundation for future LLM enhancement

---

## High-Level Architecture

### V1: Rules-first architecture

```text
Frontend
  -> POST /api/ai/analyze
      -> validate request + auth
      -> fetch relevant application data from Cosmos
      -> compute metrics and cohorts
      -> apply rules and confidence gates
      -> rank/deduplicate findings
      -> return summary + suggestions + evidence
```

### V2: Optional LLM enrichment layer

```text
Frontend
  -> POST /api/ai/analyze
      -> validate request + auth
      -> fetch relevant application data from Cosmos
      -> compute metrics and cohorts
      -> apply rules and confidence gates
      -> if LLM enabled and findings confidence is sufficient:
           rewrite findings into more natural coaching text
         else:
           return rules-only output
```

### Why this architecture

- Mobile-safe: the phone only talks to the existing backend
- Free by default: no hosted model needed for V1
- Accurate by construction: rules operate on validated metrics, not raw guesswork
- Cloud-agnostic later: any provider adapter can sit behind the same endpoint

---

## Analysis Types

V1 should support the same three user-facing analysis types already envisioned in `docs/future-work/v3-ai-analysis.md`, but implement them with rules instead of direct model inference.

| Type                 | Trigger                               | Data scope                                 | V1 approach                                         |
| -------------------- | ------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| `profile`            | Dashboard "Analyze my job search"     | All active applications in time range      | Funnel, rejection, and stage-pattern rules          |
| `interview-patterns` | Application detail interviews section | One application + interview rounds         | Interview-outcome and reflection-completeness rules |
| `rejection-analysis` | Application detail rejection section  | One rejected application + related context | Rejection-reason and process-pattern rules          |

---

## Core Design Principle: Separate Facts From Wording

The backend should distinguish between:

1. **facts** — computed metrics and detected patterns
2. **findings** — structured recommendations derived from those facts
3. **presentation** — summary text shown to the user

This allows the system to remain deterministic even if an LLM is added later. The LLM should only improve wording, prioritization, or readability. It should not decide what is true.

---

## Data Preparation Strategy

The current application data varies significantly by role, company, stage, and completeness. Because of that, the engine should not treat every application as directly comparable.

### Data preparation steps

1. Fetch relevant applications and embedded interviews.
2. Exclude soft-deleted items.
3. Normalize status and interview outcome values.
4. Compute aggregate metrics.
5. Build comparable cohorts where possible.
6. Apply minimum-sample and confidence rules before emitting advice.

### Suggested cohorts

Use cohorts only when enough data exists. Suggested grouping dimensions:

- role family or normalized role keyword
- work mode (`Remote`, `Hybrid`, `Onsite`)
- location country/region
- application period (for example recent 90 days vs all-time)

If a cohort is too small, the engine should fall back to broader aggregates or abstain.

---

## Metrics to Compute

### Profile-level metrics

- total active applications
- total submitted applications
- total interviews
- total rejected applications
- total accepted applications
- interview conversion rate
- offer conversion rate
- rejection distribution by reason
- status distribution
- average applications per week or month
- average time in current stage where inferable

### Interview-pattern metrics

- total rounds for the application
- rounds passed / failed / pending / cancelled
- failures by interview type
- presence/absence of notes
- presence/absence of reflections
- consistency of outcomes across rounds

### Rejection-analysis metrics

- rejection reason for the application
- rejection notes present/absent
- prior interview outcomes before rejection
- repeated rejection patterns across other applications
- whether this rejection fits a broader trend or looks isolated

---

## Rule Engine Design

Each rule should be deterministic and testable.

### Rule shape

Each rule should contain:

- `id`
- `analysisType`
- `condition`
- `minimumSampleSize`
- `severity`
- `confidencePolicy`
- `suggestionTemplateIds`
- `evidenceBuilder`

### Example rule categories

#### Funnel rules

- Low interview conversion after enough applications
- Low offer conversion after enough interviews
- High drop-off between recruiter screening and interview stage

#### Rejection-pattern rules

- One rejection reason dominates overall outcomes
- Ghosting exceeds a threshold
- Salary mismatch repeats often enough to justify scope adjustment

#### Interview-quality rules

- Technical interview failures recur
- Behavioral interview failures recur
- Reflections are missing for most interview rounds

#### Process-discipline rules

- Many applications remain in early stages for long periods
- Notes/reflections are too sparse to support deeper insight

---

## Confidence and Abstain Behavior

Confidence is critical because the data can be sparse and heterogeneous.

### Confidence bands

- **High**: enough sample size and a clear directional pattern
- **Medium**: moderate evidence, useful but not decisive
- **Low**: weak or noisy evidence; suggestions should be soft and clearly caveated

### Minimum evidence guidance

Suggested starting thresholds:

- profile conversion advice requires at least 15 to 20 applications
- offer-conversion advice requires at least 5 interviews
- dominant rejection-reason advice requires at least 4 rejections
- interview-pattern advice requires at least 2 completed rounds

### Abstain cases

Return no strong recommendation when:

- sample size is too small
- data is too incomplete
- no pattern crosses threshold
- the relevant cohort is too mixed to compare fairly

In these cases the API should still respond successfully, but with:

- a transparent summary such as "Not enough evidence yet"
- lighter next-step suggestions focused on data collection and consistency

---

## Suggestion Construction

Suggestions in V1 are not generated by a model. They are assembled from a recommendation library.

### Suggestion pipeline

1. compute metrics
2. trigger matching rules
3. attach evidence
4. select suggestion templates
5. fill template placeholders with actual numbers or categories
6. rank and deduplicate
7. emit top suggestions

### Suggestion template structure

Each template should include:

- `id`
- `title`
- `body`
- `actions[]`
- `tags[]`
- `applicability`

### Example template placeholders

- `{interviewRate}`
- `{applicationCount}`
- `{dominantReason}`
- `{failedInterviewType}`

### Example output tone

Suggestions should be:

- concise
- direct but not harsh
- practical and actionable
- explicit about the evidence used

---

## API Contract

Retain the planned endpoint shape so future LLM support can fit under the same contract.

### Endpoint

`POST /api/ai/analyze`

### Request

```json
{
  "type": "profile" | "interview-patterns" | "rejection-analysis",
  "applicationId": "uuid"
}
```

`applicationId` is required for `interview-patterns` and `rejection-analysis`.

### Response

```json
{
  "data": {
    "summary": "string",
    "suggestions": [
      {
        "id": "string",
        "title": "string",
        "body": "string",
        "actions": ["string"],
        "severity": "high | medium | low",
        "confidence": "high | medium | low",
        "evidence": ["string"]
      }
    ],
    "mode": "rules",
    "cachedAt": "ISO timestamp"
  },
  "error": null
}
```

### Notes

- `mode` allows the same contract to later return `rules+llm`
- `evidence` keeps the output explainable and testable
- `cachedAt` supports reuse and re-analyze UX

---

## Caching Strategy

Caching is still useful in the rules-first design because analysis may read many documents and compute aggregates repeatedly.

### V1 cache approach

- cache analysis output for 24 hours
- allow explicit re-analyze to bypass cache
- invalidate relevant cache when underlying application/interview data changes

### Suggested storage approach

- per-application analysis can live on the application document under an `analysisCache` field
- profile analysis should use a dedicated cache item keyed by user + analysis type + time range

Because the app is single-user today, caching can stay simple. If multi-user ever becomes real, keying strategy must change.

---

## Frontend Surface Plan

### Dashboard

- add an `AI Insights` card or section below existing stats
- include `Analyze my job search` action
- show loading, empty, success, and insufficient-evidence states
- display evidence-backed suggestions, not just prose

### Application detail

- add `Get AI coaching tips` in the interviews section
- add `Get AI feedback on this rejection` in the rejection section
- show inline analysis panels scoped to that section
- include `Re-analyze` action

### UI guidance

- clearly label low-confidence output
- show when the result was cached
- show a subtle note when the result is rules-based rather than live-model generated

---

## Demo Mode Strategy

Demo mode should preserve the same API shape.

### V1 demo behavior

- `POST /api/ai/analyze` in MSW returns deterministic prewritten rule-based insights
- responses should include `mode: "rules"`
- canned evidence lines should match seeded demo data, not generic placeholders

This keeps demo mode honest while avoiding any live AI dependency.

---

## Future LLM Enrichment Layer

Once the rules engine is established and validated, add an optional hosted-model adapter.

### LLM responsibilities

- rewrite high-confidence findings into smoother natural language
- synthesize multiple findings into one short summary
- preserve evidence and actions already chosen by the rules engine

### LLM non-responsibilities

- deciding whether a pattern exists
- overriding confidence
- fabricating advice unsupported by computed metrics

### Provider strategy

- keep provider behind an adapter interface
- default to disabled in environments with no model key
- support cheap hosted models later without changing the frontend

This keeps paid AI optional and bounded.

---

## Risks and Mitigations

### Risk: advice feels too generic

Mitigation:

- personalize suggestions with concrete evidence
- show exact counts, rates, or repeated outcomes where possible
- rank only top 3 to 5 suggestions

### Risk: advice is misleading due to small sample size

Mitigation:

- minimum sample thresholds
- explicit confidence labels
- abstain behavior for weak data

### Risk: mixed application types distort insight quality

Mitigation:

- cohorting strategy
- fallback to broader analysis only when transparent
- avoid strong claims across incompatible groups

### Risk: future LLM layer becomes the de facto source of truth

Mitigation:

- preserve rules engine as primary logic
- keep evidence attached to all findings
- treat LLM as presentation only

---

## Suggested Implementation Order

1. finalize response contract
2. define metrics and cohort builder
3. define initial rule catalog
4. implement ranking and confidence logic
5. add API endpoint
6. add dashboard and application-detail UI
7. add demo-mode parity
8. add caching
9. optionally add LLM enrichment adapter later

---

## Open Decisions

- exact threshold values for each rule
- whether profile analysis defaults to a fixed date window or all-time
- whether to expose confidence numerically or as bands only
- whether to store rule IDs in cached output for debugging and future analytics
- whether LLM enrichment should be per-request configurable or environment-only

---

## Recommendation

Proceed with a **rules-first AI Insights V1** and treat hosted-model support as a separate follow-on phase.

This gives the project:

- a genuinely free default implementation
- a stable mobile-friendly architecture
- a trustworthy base for future AI enhancement
- lower product and cost risk than starting with a paid model dependency
