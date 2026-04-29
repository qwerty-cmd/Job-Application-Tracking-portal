# V3: PWA Mobile — Implementation Plan

## Overview

Convert the existing React SPA into a Progressive Web App (PWA) so it can be installed on Android and iOS home screens and used like a native app. All changes are frontend-only — no backend, no new Azure resources, no new CI/CD configuration.

**Branch:** `feature/pwa-mobile`
**Status:** Planning complete, implementation not started

---

## Goals

- Installable on Android (Chrome) and iOS (Safari) via "Add to Home Screen"
- Opens full-screen with no browser chrome (no address bar)
- Usable on small screens (360–430px wide) without horizontal scrolling or clipped content
- Bottom tab bar navigation on mobile, existing header nav on desktop
- Modals slide up as bottom drawers on mobile
- App list shows stacked cards on mobile instead of a wide table

## Non-goals

- Push notifications
- Offline support / background sync
- App Store / Play Store listing
- Any backend changes

---

## Dependencies to Install

| Package | Purpose |
|---------|---------|
| `vite-plugin-pwa` | Generates `manifest.json` and service worker via Workbox |
| `vaul` | Bottom-drawer primitive (powers shadcn Drawer component) |

```bash
cd client
npm install vite-plugin-pwa vaul
```

---

## Phase Dependency Order

```
Step 1: Install dependencies + PWA plumbing (vite.config.ts, index.html, icons)
    ↓
Step 2: useIsMobile hook
    ↓
Step 3: BottomNav component + NavBar mobile update + App.tsx wiring
    ↓
Step 4: ApplicationCard component
    ↓
Step 5: ApplicationsTable — add mobile card view
    ↓
Step 6: Drawer UI component (shadcn scaffold)
    ↓
Step 7: DrawerDialog responsive wrapper
    ↓
Step 8: CreateApplicationModal + InterviewModal — swap to DrawerDialog
    ↓
Step 9: Tests (write first per TDD, then implement)
```

---

## Step 1 — PWA Plumbing

### `vite.config.ts`

Add `vite-plugin-pwa`:

```ts
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Job Tracker',
        short_name: 'JobTracker',
        description: 'Track your job applications end-to-end',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  // ... rest unchanged
})
```

### `index.html`

Add iOS-specific meta tags:

```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Job Tracker" />
<link rel="apple-touch-icon" href="/icon-192.png" />
```

### Icons

Add two PNG icons to `client/public/`:
- `icon-192.png` — 192×192 (required for Android install prompt)
- `icon-512.png` — 512×512 (splash screen, maskable)

**Tests:** None — build artefact.

---

## Step 2 — `useIsMobile` hook

**New file:** `client/src/hooks/useIsMobile.ts`

Listens to `window.matchMedia("(max-width: 767px)")` and returns a reactive boolean. Updates on resize.

```ts
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 767px)').matches
  )

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isMobile
}
```

**Tests — `useIsMobile.test.ts` (new, 3 tests):**
```
✓ returns false when window.matchMedia reports non-mobile
✓ returns true when window.matchMedia reports mobile
✓ updates state when matchMedia fires a change event
```

---

## Step 3 — `BottomNav` component

**New file:** `client/src/components/BottomNav.tsx`

Fixed bottom bar with 3 tabs using `NavLink`. Hidden on `md+` with `md:hidden`.

```
┌────────────────────────────────────┐
│  [grid]  Apps  │  [bar]  Dash  │  [trash]  Trash  │
└────────────────────────────────────┘
```

Each tab: Lucide icon above a label, active state highlights with `text-primary`.

### Changes to `NavBar.tsx`

Add `hidden md:flex` to the `<nav>` element containing the route links. The logo and user/demo section in the header stay visible on all screen sizes.

### Changes to `App.tsx`

- Import and render `<BottomNav />` inside `AppLayout` after `<main>`
- Add `pb-16 md:pb-0` to `<main>` so content isn't hidden behind the bottom bar on mobile

**Tests — `BottomNav.test.tsx` (new, 5 tests):**
```
✓ renders Applications link
✓ renders Dashboard link
✓ renders Trash link
✓ Applications link href is "/"
✓ Dashboard link href is "/dashboard"
```

**Changes to `NavBar.test.tsx` (existing, +1 test):**
```
✓ nav link elements are present in the DOM (hidden via CSS on mobile)
```

---

## Step 4 — `ApplicationCard` component

**New file:** `client/src/components/ApplicationCard.tsx`

Tappable card for a single `ApplicationSummary`. Used in the mobile list view.

```
┌──────────────────────────────────┐
│ Stripe Inc.              [badge] │
│ Senior Software Engineer         │
│ London, UK · Remote              │
│ Applied 2024-03-15               │
└──────────────────────────────────┘
```

Props: `item: ApplicationSummary` — same type as `ApplicationsTable` rows.
Behaviour: `onClick` → `navigate(`/applications/${item.id}`)`.

**Tests — `ApplicationCard.test.tsx` (new, 8 tests):**
```
✓ renders company name
✓ renders role
✓ renders status badge
✓ renders dateApplied
✓ renders city and country when present
✓ renders work mode when present
✓ renders "—" for location when city and country are absent
✓ clicking the card navigates to /applications/:id
```

---

## Step 5 — `ApplicationsTable` mobile card view

**File changed:** `client/src/components/ApplicationsTable.tsx`

Wrap the existing `<Table>` block:

```tsx
{/* Desktop: table */}
<div className="hidden md:block">
  <Table>...</Table>
</div>

{/* Mobile: card list */}
<div className="block md:hidden space-y-2">
  {items.length === 0 ? (
    <EmptyState onCreateClick={onCreateClick} />
  ) : (
    items.map((item) => <ApplicationCard key={item.id} item={item} />)
  )}
</div>

{/* Pagination — shared, unchanged */}
```

No new props, no new data fetching. Same `items`, `pagination`, `filters`, `onFiltersChange`, `onCreateClick`.

**Tests — `ApplicationsTable.test.tsx` (new, 6 tests):**
```
✓ table container has class "hidden md:block"
✓ card list container has class "block md:hidden"
✓ card list renders correct number of items
✓ empty state renders when items array is empty
✓ empty state shows "+ New Application" button when onCreateClick is provided
✓ pagination renders when totalPages > 1
```

---

## Step 6 — Shadcn `Drawer` UI component

**New file:** `client/src/components/ui/drawer.tsx`

Standard shadcn Drawer component scaffolded from the shadcn CLI or copied from the shadcn docs. Backed by `vaul`. No custom logic.

Exports: `Drawer`, `DrawerTrigger`, `DrawerContent`, `DrawerHeader`, `DrawerTitle`, `DrawerDescription`, `DrawerFooter`, `DrawerClose`.

**Tests:** None — third-party UI primitive.

---

## Step 7 — `DrawerDialog` responsive wrapper

**New file:** `client/src/components/DrawerDialog.tsx`

Renders a `<Drawer>` (bottom sheet) on mobile and a `<Dialog>` on desktop. Consumers pass props once; the wrapper handles the switch.

```tsx
interface DrawerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
}

export function DrawerDialog({ open, onOpenChange, title, description, children }: DrawerDialogProps) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          {children}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
```

**Tests — `DrawerDialog.test.tsx` (new, 4 tests):**
```
✓ renders title when open is true
✓ renders children content when open is true
✓ does not render content when open is false
✓ calls onOpenChange(false) when the close action is triggered
```

---

## Step 8 — `CreateApplicationModal` and `InterviewModal`

**Files changed:** both modal files.

### `CreateApplicationModal.tsx`

Replace:
```tsx
<Dialog open={open} onOpenChange={handleClose}>
  <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>New Application</DialogTitle>
      <DialogDescription>...</DialogDescription>
    </DialogHeader>
    <form ...>
      {/* fields unchanged */}
      <DialogFooter>...</DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

With:
```tsx
<DrawerDialog
  open={open}
  onOpenChange={handleClose}
  title="New Application"
  description="Create a new job application. Files can be uploaded after creation."
>
  <form className="flex flex-col gap-4 px-4 pb-4 overflow-y-auto">
    {/* fields completely unchanged */}
    <div className="flex gap-2 justify-end">
      {/* same Cancel + Create buttons */}
    </div>
  </form>
</DrawerDialog>
```

`<DialogFooter>` replaced with `<div className="flex gap-2 justify-end">` — works in both Drawer and Dialog contexts without importing the footer component.

### `InterviewModal.tsx`

Same pattern — swap `<Dialog>` wrapper for `<DrawerDialog>` with `title` and `description` props. Form content is completely unchanged.

**Tests:** Covered by the existing `ApplicationsPage.test.tsx` modal interaction tests (open, validate, submit, close). If those 4 tests pass after the swap, the change is correct.

---

## File Change Summary

| # | File | New / Changed | Test File |
|---|------|--------------|-----------|
| 1 | `client/vite.config.ts` | Changed | — |
| 2 | `client/index.html` | Changed | — |
| 3 | `client/public/icon-192.png` | New | — |
| 4 | `client/public/icon-512.png` | New | — |
| 5 | `client/src/hooks/useIsMobile.ts` | New | `useIsMobile.test.ts` (3 tests) |
| 6 | `client/src/components/BottomNav.tsx` | New | `BottomNav.test.tsx` (5 tests) |
| 7 | `client/src/components/NavBar.tsx` | Changed | Extend existing (+1 test) |
| 8 | `client/src/App.tsx` | Changed | — |
| 9 | `client/src/components/ApplicationCard.tsx` | New | `ApplicationCard.test.tsx` (8 tests) |
| 10 | `client/src/components/ApplicationsTable.tsx` | Changed | `ApplicationsTable.test.tsx` (6 tests) |
| 11 | `client/src/components/ui/drawer.tsx` | New | — |
| 12 | `client/src/components/DrawerDialog.tsx` | New | `DrawerDialog.test.tsx` (4 tests) |
| 13 | `client/src/components/CreateApplicationModal.tsx` | Changed | Covered by existing tests |
| 14 | `client/src/components/InterviewModal.tsx` | Changed | Covered by existing tests |

**New tests: 27 across 5 new test files.**
**Existing tests that must continue to pass: 68.**
**Target on completion: 95+ tests.**

---

## Effort Estimate

| Area | Estimated effort |
|------|-----------------|
| PWA plumbing (Step 1) | 2–3 hours |
| useIsMobile + BottomNav + NavBar (Steps 2–3) | 3–4 hours |
| ApplicationCard + Table mobile view (Steps 4–5) | 3–4 hours |
| DrawerDialog + modal updates (Steps 6–8) | 3–4 hours |
| Tests (all 5 new test files) | 3–4 hours |
| **Total** | **~14–19 hours** |

---

## Definition of Done

- [ ] App passes Chrome's PWA installability check (Lighthouse PWA audit: green)
- [ ] "Add to Home Screen" prompt appears on Android Chrome
- [ ] App opens full-screen on iOS Safari (no address bar)
- [ ] All 95+ tests pass, 0 TypeScript errors
- [ ] No regressions on the existing 68 tests
- [ ] ApplicationsPage renders correctly on 390px viewport (no horizontal scroll)
- [ ] CreateApplicationModal opens as bottom drawer on 390px viewport
- [ ] BottomNav tabs navigate correctly and show active state
