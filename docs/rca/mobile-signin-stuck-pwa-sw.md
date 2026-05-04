# RCA: Mobile Sign-In Stuck After PWA Service Worker Install

**Date:** 2026-05-04
**Reported Symptom:** On mobile, after tapping **Sign in with GitHub** the auth page appears, but completing GitHub login does not return the user to the app — the flow seems to stall, and the app never transitions to the authenticated state.
**Status:** Fixed in [client/vite.config.ts](client/vite.config.ts) and [client/public/staticwebapp.config.json](client/public/staticwebapp.config.json).

---

## Root Cause

**The PWA service worker installed by `vite-plugin-pwa` was hijacking the SWA Easy Auth navigations (`/.auth/login/github` and its OAuth callback) and serving the cached `index.html` instead of letting the request reach the Static Web Apps platform.**

Workbox's default SPA navigation strategy (`registerType: "autoUpdate"` with no denylist) treats every top-level navigation as an app-shell route and responds with the precached `index.html`. That is correct for React Router routes like `/applications/:id`, but it is wrong for `/.auth/*` because those URLs are not part of the SPA — they are handled by the Static Web Apps Easy Auth runtime. When the OAuth provider redirects back to `https://<site>/.auth/login/github/callback?...`, the service worker intercepts the navigation, returns `index.html`, and the session cookie is never set. From the user's perspective the page appears to do nothing.

This is more visible on mobile because:

- Mobile users are more likely to have the SW already registered (the app was installed/visited previously).
- iOS Safari + "Add to Home Screen" runs the app in standalone mode, where the SW is always active and there's no easy way to bypass it (no `Shift+Reload`).
- Desktop users often hit `Ctrl+F5` which bypasses the SW for a single load, masking the bug during local testing.

### Why this didn't show up earlier

- Phase 4 frontend work predates the V3 PWA work; auth was tested before the SW was added.
- V3 PWA testing focused on offline shell, install prompts, and mobile layout — not the auth round-trip.
- Frontend tests use MSW, not the production SW, so the test suite cannot catch this class of bug.

---

## Fix

Two layers of defence — exclude auth/API paths from both the service worker's navigation fallback **and** the Static Web Apps platform navigation fallback.

### 1. Vite PWA / Workbox config

[client/vite.config.ts](client/vite.config.ts):

```ts
VitePWA({
  registerType: "autoUpdate",
  includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png"],
  workbox: {
    // Do not let the SW hijack auth or API navigations. Without this,
    // the GitHub OAuth redirect (/.auth/login/github and its callback)
    // is served the cached index.html and sign-in appears stuck.
    navigateFallbackDenylist: [/^\/\.auth\//, /^\/api\//],
  },
  manifest: { /* ... */ },
}),
```

`navigateFallbackDenylist` tells Workbox: for navigations matching these patterns, do **not** respond from cache — let the request pass through to the network so SWA can handle it.

### 2. Static Web Apps config

[client/public/staticwebapp.config.json](client/public/staticwebapp.config.json):

```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/api/*", "/.auth/*", "/*.js", "/*.css", "..."]
  }
}
```

Adding `/.auth/*` to `exclude` ensures the SWA platform itself never rewrites auth paths to `index.html` either. Defence-in-depth.

---

## Recovery for Already-Affected Users

Because the broken SW is already registered on affected devices, the new SW takes effect only after the existing one updates. With `registerType: "autoUpdate"`:

1. User reopens the site.
2. Workbox fetches the new SW manifest in the background.
3. On the next navigation/refresh, the new SW activates with the denylist applied.

If a user is **completely stuck** (cannot get past the login page even to trigger an update), they can:

- Pull-to-refresh once.
- If still broken: Browser settings → Site settings → clear site data (this unregisters the SW). Next load installs the fixed SW.

---

## Lessons Learned

1. **Service workers and OAuth redirects are a known dangerous combination.** Any path served by the auth provider (or any non-SPA backend), not just static assets, must be in the SW navigation denylist. The vite-plugin-pwa default `navigateFallback` only excludes file-extension URLs, not auth routes.

2. **`/.auth/*` is not an app route — it belongs to the platform.** Both Workbox and SWA's own `navigationFallback.exclude` need to know this. Treat them symmetrically.

3. **Test the auth flow on the real production build with the SW active**, not just `npm run dev`. The dev server doesn't run the production SW, so this entire class of bug is invisible during local development. Add a manual smoke-test step:
   - Build, preview (`vite preview`), open in incognito, log out + log in.
   - Repeat in iOS Safari standalone mode.

4. **Mobile bugs often come from environments that don't exist on desktop** — installed PWAs, standalone display mode, persistent service workers. When mobile-only bugs are reported, suspect environment-level features (SW, manifest, viewport, cookies with `SameSite`) before suspecting React code.

5. **`registerType: "autoUpdate"` is recoverable but not instant.** If a SW bug ships, users will keep hitting it until the new SW fetches and activates. Plan for this: keep the bad-SW-recovery instructions handy, and consider a `skipWaiting`/`clientsClaim` config so updates apply on first navigation rather than after a tab close.

6. **A pre-existing TS error showed up while editing the config** — `vite-plugin-pwa` was declared in `package.json` but `node_modules` was empty in this checkout, so the import failed. `npm install` in `client/` plus a TS server restart cleared it. Worth adding `cd client && npm ci` to onboarding docs to avoid this trap.

---

## Related Files

- [client/vite.config.ts](client/vite.config.ts) — Workbox `navigateFallbackDenylist`
- [client/public/staticwebapp.config.json](client/public/staticwebapp.config.json) — SWA `navigationFallback.exclude`
- [client/src/contexts/AuthProvider.tsx](client/src/contexts/AuthProvider.tsx) — `login()` redirects to `/.auth/login/github`
- [docs/plans/v3-pwa-mobile-implementation-plan.md](docs/plans/v3-pwa-mobile-implementation-plan.md) — original PWA plan (did not call out auth-path exclusion)
