---
description: "Use when writing or modifying MSW mock handlers and demo mode plumbing. Covers handler shape, response parity, and demo-specific pitfalls."
applyTo: "client/src/mocks/**"
---

# MSW Demo Mode Conventions

## Source of Truth

- Read `docs/future-work/v2-demo-mode-architecture.md` for how demo mode works end-to-end.
- Read `docs/rca/mobile-signin-stuck-pwa-sw.md` before changing auth, SW, or navigation behavior.
- Keep mock behavior aligned to the API contract in `docs/project/CLAUDE.md`.

## Handler Design

- Keep handlers in `client/src/mocks/handlers.ts` deterministic and readable.
- Return the same response envelope as production API: `{ data, error }`.
- Match realistic status codes and validation behavior where feasible.
- Preserve seeded data coverage across statuses so dashboard and list filters remain meaningful.

## Demo Mode Boundaries

- Demo mode must never call Azure resources.
- Demo state should stay tab-scoped/session-scoped as designed.
- Changes to auth or bootstrap flow must preserve refresh restore behavior.

## Upload and File Flow

- Keep upload mocks compatible with frontend polling expectations.
- Ensure mock upload updates required timestamps/metadata used by UI completion checks.

## Service Worker and Routing Safety

- Do not route or mock platform auth endpoints (`/.auth/*`) as app routes.
- Preserve service worker navigation exclusions for auth and API paths.
- If auth flow logic changes, verify both browser-tab and installed-PWA scenarios.

## Testing Expectations

- Update tests when handler behavior changes.
- Prefer network-level MSW assertions over direct function internals.
