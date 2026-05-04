---
description: "Create a root cause analysis for a bug, incident, or regression using the project's RCA format."
agent: "agent"
argument-hint: "Bug summary and symptom, for example: Mobile login stalls after GitHub auth in installed PWA"
---

Create a root cause analysis for: $ARGUMENTS

## Output File

Write the RCA in `docs/rca/<short-slug>.md` using the existing style in `docs/rca/`.

## Steps

1. Read context docs:
   - `docs/project/CLAUDE.md`
   - `docs/project/DEVLOG.md` (if relevant)
   - Existing RCA examples in `docs/rca/`
2. Inspect the relevant implementation and tests.
3. If needed, run targeted tests to confirm behavior.
4. Produce an RCA that is specific, evidence-based, and actionable.

## Required Sections

1. Incident Summary
2. User Impact
3. Root Cause
4. Trigger and Contributing Factors
5. Fix Implemented
6. Why Existing Tests Did Not Catch It
7. Preventive Actions
8. Validation Performed
9. Related Files

## Quality Bar

- Clearly separate root cause from symptoms.
- Include concrete technical evidence (files, logic paths, request/response behavior).
- Include at least one preventive action in tests and one in process/documentation.
- Keep the writeup concise, but complete enough for future debugging.
