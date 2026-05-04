---
description: "Use when building or modifying frontend React code. Covers component, form, state, routing, and API integration conventions for this project."
applyTo: "client/**/*.tsx"
---

# Frontend Conventions

## Source of Truth

- Read `docs/project/CLAUDE.md` for architecture and API contract.
- Follow the page flow and conventions in `docs/guides/frontend-workflow.md`.
- Match planned mobile and PWA behavior in `docs/plans/v3-pwa-mobile-implementation-plan.md`.

## Component and State Patterns

- Keep page-level orchestration in `client/src/pages/` and reusable UI in `client/src/components/`.
- Use strict TypeScript with explicit props/types; avoid `any`.
- Keep state local by default. Promote to context only when shared cross-page.
- Prefer existing hooks in `client/src/hooks/` and utilities in `client/src/lib/` before adding new abstractions.

## Forms and Validation

- Use `react-hook-form` with `zod` schemas for user input flows.
- Validate at the form boundary and surface field-level errors clearly.
- Keep frontend enum constraints aligned with backend contract values in `docs/project/CLAUDE.md`.

## API and Data Handling

- Route all network calls through shared API helpers/hooks in `client/src/lib/` and `client/src/hooks/`.
- Never hardcode base URLs; use configured environment-driven API access patterns.
- Preserve the backend response contract shape: `{ data, error }`.

## UX and Accessibility

- Preserve existing design system patterns (Shadcn + Tailwind) used in the codebase.
- Ensure keyboard accessibility and sensible focus order for forms, dialogs, and interactive controls.
- Handle loading, empty, error, and success states explicitly for each async view.

## Testing Expectations

- Add or update tests for user-facing behavior after UI changes.
- Prefer React Testing Library + MSW behavior tests over implementation-detail assertions.
- Run frontend tests from `client/`: `npm test`.
