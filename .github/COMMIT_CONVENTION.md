# Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Commits are enforced by commitlint + husky on the `commit-msg` hook.

---

## Format

```
type(scope): short description

[optional body]

[optional footer]
```

- **type** — what kind of change (required)
- **scope** — what part of the codebase (required for this project)
- **short description** — imperative, lowercase, no period, max 72 chars
- **body** — wrap at 100 chars, use to explain *why* not *what*
- **footer** — breaking changes (`BREAKING CHANGE:`), issue refs

---

## Types

| Type | When to use |
|------|-------------|
| `feat` | New feature or capability visible to the user |
| `fix` | Bug fix |
| `test` | Adding or updating tests (no production code changes) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `docs` | Documentation only (markdown, comments, CLAUDE.md, DEVLOG.md) |
| `style` | Formatting, whitespace, missing semicolons — no logic change |
| `perf` | Performance improvement |
| `ci` | CI/CD workflow changes (`.github/workflows/`) |
| `build` | Build system changes (`vite.config.ts`, `package.json`, `tsconfig.json`) |
| `chore` | Tooling, dependencies, config that doesn't fit the above |

---

## Scopes

| Scope | What it covers |
|-------|---------------|
| `api` | Azure Functions backend (`api/`) |
| `client` | React frontend (`client/`) |
| `infra` | Bicep IaC (`infra/`) |
| `ci` | GitHub Actions workflows (`.github/workflows/`) |
| `docs` | Documentation files (`docs/`, `README.md`, `CLAUDE.md`) |
| `pwa` | PWA-specific changes (manifest, service worker, icons, mobile layout) |
| `demo` | Demo mode (MSW handlers, `demoMode.ts`, demo UI) |
| `auth` | Authentication and authorisation (both client and API) |
| `tests` | Cross-cutting test infrastructure (`test-utils`, MSW setup, vitest config) |

Use the most specific scope that applies. If a commit genuinely spans multiple scopes, use the primary one and mention the others in the body.

---

## Examples

```
feat(pwa): add vite-plugin-pwa with manifest and iOS meta tags
```

```
feat(client): add BottomNav component for mobile tab navigation
```

```
feat(pwa): add DrawerDialog responsive wrapper for modals
```

```
fix(client): prevent ApplicationsTable horizontal scroll on 390px viewport
```

```
test(client): add ApplicationCard and BottomNav unit tests
```

```
refactor(client): extract useIsMobile hook from DrawerDialog
```

```
build(client): add vaul dependency for shadcn Drawer component
```

```
docs(docs): add V3 PWA mobile implementation plan
```

```
ci: add PWA Lighthouse audit step to SWA workflow
```

```
chore: set up commitlint and husky for commit message enforcement
```

---

## Rules

1. **Scope is required** — never omit it (e.g. `feat: add thing` is rejected)
2. **Lowercase description** — `feat(client): add nav` not `feat(client): Add Nav`
3. **No period at end** — `fix(api): handle null body` not `fix(api): handle null body.`
4. **Imperative mood** — `add`, `fix`, `update`, `remove` not `added`, `fixes`, `updated`
5. **Max 72 chars for header** — if you need more, use the body
6. **Breaking changes** — add `BREAKING CHANGE: <description>` in the footer, and append `!` after the scope: `feat(api)!: change response shape`

---

## What Gets Rejected

```
# No scope
feat: add bottom nav

# Wrong type
update(client): fix modal

# Uppercase description
feat(client): Add BottomNav

# Period at end
fix(api): handle missing auth header.

# Vague description
fix(client): stuff

# Header too long (over 72 chars)
feat(client): add responsive DrawerDialog wrapper component that switches between Drawer and Dialog based on screen width
```

---

## Enforcement

Commitlint runs on every `git commit` via the `commit-msg` husky hook. The hook is installed automatically when you run `npm install` at the repo root.

If your commit is rejected, read the error, fix the message, and re-run `git commit`.

To bypass in emergencies only:
```bash
git commit --no-verify -m "..."
```
