# Phase 4 — Frontend Wireframes

> **Date:** 2026-03-22
> **Status:** Draft — awaiting review before implementation
> **Tech:** React + TypeScript (Vite), hosted on Azure Static Web Apps

---

## Table of Contents

1. [Site Map & Navigation Flow](#1-site-map--navigation-flow)
2. [Login Page](#2-login-page)
3. [Applications List (Main Page)](#3-applications-list-main-page)
4. [Application Detail Page](#4-application-detail-page)
5. [Dashboard / Stats Page](#5-dashboard--stats-page)
6. [Deleted Applications Page](#6-deleted-applications-page)
7. [Shared Components](#7-shared-components)
8. [Design Notes](#8-design-notes)

---

## 1. Site Map & Navigation Flow

```
                        ┌──────────────┐
                        │  Login Page  │
                        │ (GitHub OAuth)│
                        └──────┬───────┘
                               │ authenticated
                               ▼
                    ┌──────────────────────┐
                    │   Applications List  │ ◄── default landing page
                    │     (Main Page)      │
                    └──┬──────┬────────┬───┘
                       │      │        │
            ┌──────────┘      │        └──────────┐
            ▼                 ▼                    ▼
  ┌─────────────────┐ ┌──────────────┐  ┌──────────────────┐
  │  Application    │ │  Dashboard / │  │  Deleted Apps     │
  │  Detail Page    │ │  Stats Page  │  │  (Trash)          │
  └─────────────────┘ └──────────────┘  └──────────────────┘
```

### Navigation Bar (persistent, all pages)

```
┌──────────────────────────────────────────────────────────────────────┐
│  📋 Job Tracker    [Applications]   [Dashboard]   [Trash]   [Logout]│
└──────────────────────────────────────────────────────────────────────┘
```

- **Applications** → `/` (main page, default)
- **Dashboard** → `/dashboard`
- **Trash** → `/deleted`
- **Application Detail** → `/applications/:id` (navigated via click, not nav link)
- **Login** → `/login` (shown when unauthenticated)

---

## 2. Login Page

**Route:** `/login`
**Purpose:** Authenticate the user via Azure SWA's built-in GitHub provider.

> **Implementation note:** Azure SWA handles GitHub OAuth natively.
> The "login" is just a redirect to `/.auth/login/github`.
> No username/password form is needed — GitHub handles credentials.
> SWA returns a session with `x-ms-client-principal` containing roles.

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                                                                      │
│                                                                      │
│                    ┌────────────────────────────┐                     │
│                    │                            │                     │
│                    │    📋 Job Application      │                     │
│                    │       Tracker              │                     │
│                    │                            │                     │
│                    │  Track your job search     │                     │
│                    │  journey in one place.     │                     │
│                    │                            │                     │
│                    │  ┌──────────────────────┐  │                     │
│                    │  │  🔑 Sign in with     │  │                     │
│                    │  │     GitHub            │  │                     │
│                    │  └──────────────────────┘  │                     │
│                    │                            │                     │
│                    │  Private app · Owner only  │                     │
│                    │                            │                     │
│                    └────────────────────────────┘                     │
│                                                                      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Behaviour

- Unauthenticated users are redirected here automatically.
- "Sign in with GitHub" button navigates to `/.auth/login/github?post_login_redirect_uri=/`.
- On success, SWA sets session cookies and redirects to the main page.
- If the user is authenticated but lacks the `owner` role → show "Access denied" message.

---

## 3. Applications List (Main Page)

**Route:** `/`
**Purpose:** View, filter, sort, and manage all job applications in a spreadsheet-style table. Entry point for creating new applications.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  📋 Job Tracker    [Applications]   [Dashboard]   [Trash]   [Logout]                                               │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                      │
│  My Applications                                                                            [+ New Application]     │
│                                                                                                                      │
│  ┌─── Filters ────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  Status: [All Statuses ▾]   From: [____-__-__]   To: [____-__-__]   Sort: [Date Applied ▾]  [↓ Desc ▾] [Apply]│  │
│  └────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                                      │
│  Showing 1–20 of 47 applications                                                                                    │
│                                                                                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  Company ▾       │ Role ▾              │ Location           │ Work Mode │ Applied ▾  │ Status ▾            │ 📎│  │
│  ├──────────────────┼─────────────────────┼────────────────────┼───────────┼────────────┼─────────────────────┼───┤  │
│  │  Contoso Ltd     │ Senior Cloud Eng.   │ Sydney, AU         │ Hybrid    │ 2026-03-15 │ 🟣 Interview Stage  │✓✓✓│  │
│  │  Fabrikam Inc    │ Platform Engineer   │ Melbourne, AU      │ Remote    │ 2026-03-12 │ 🔵 App. Submitted   │✓✗✗│  │
│  │  Northwind Corp  │ DevOps Lead         │ —                  │ Remote    │ 2026-03-10 │ 🔴 Rejected         │✓✓✗│  │
│  │  Tailspin Toys   │ SRE                 │ London, UK         │ Hybrid    │ 2026-03-08 │ 🟡 Pending Offer    │✓✓✓│  │
│  │  Adventure Works │ Cloud Architect     │ —                  │ Remote    │ 2026-03-05 │ 🟢 Accepted         │✓✗✓│  │
│  │  Woodgrove Bank  │ Backend Developer   │ Perth, AU          │ Onsite    │ 2026-03-03 │ ⚪ Applying          │✗✗✗│  │
│  │  Litware Inc     │ Full Stack Dev      │ Brisbane, AU       │ Hybrid    │ 2026-03-01 │ 🔵 Recruiter Screen │✓✓✗│  │
│  │  ...             │                     │                    │           │            │                     │   │  │
│  ├──────────────────┴─────────────────────┴────────────────────┴───────────┴────────────┴─────────────────────┴───┤  │
│  │  [◀ Prev]                                Page 1 of 3                                             [Next ▶]     │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Table Columns

| Column        | Content                          | Sortable | Notes                              |
| ------------- | -------------------------------- | -------- | ---------------------------------- |
| **Company**   | Company name                     | Yes      | Click header to sort A–Z / Z–A     |
| **Role**      | Job title (truncated if long)    | Yes      |                                    |
| **Location**  | City, Country (or "—" if empty)  | No       |                                    |
| **Work Mode** | Remote / Hybrid / Onsite         | No       |                                    |
| **Applied**   | Date applied (YYYY-MM-DD)        | Yes      | Default sort column (newest first) |
| **Status**    | Colour-coded status badge        | Yes      | See badge colours in §7.6          |
| **📎 Files**  | Three indicators: Resume, CL, JD | No       | ✓ = uploaded, ✗ = missing          |

### Row Interactions

| Action          | Trigger                                        |
| --------------- | ---------------------------------------------- |
| **View detail** | Click anywhere on a row → navigates to `/:id`  |
| **Hover**       | Row highlights on hover (pointer cursor)       |
| **Sort**        | Click column header ▾ to toggle sort direction |

### Interactions

| Element               | Action                                                    |
| --------------------- | --------------------------------------------------------- |
| **+ New Application** | Opens the Create Application modal/drawer                 |
| **Table row**         | Clicks through to Application Detail (`/:id`)             |
| **Column headers**    | Click to sort (toggles asc/desc), active column shows ▲/▾ |
| **Status badge**      | Colour-coded by status (see Design Notes §7.6)            |
| **Filter bar**        | Status dropdown, date range, sort field & order           |
| **Pagination**        | Previous/Next with page indicator                         |
| **📎 indicators**     | Three-character shorthand: R(esume) CL JD, ✓ or ✗         |

### Create Application Modal

Opens when "**+ New Application**" is clicked. Overlays the main page.

```
┌──────────────────────────────────────────────────────────┐
│  ✕                 New Application                       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Company *          [________________________]           │
│  Role / Title *     [________________________]           │
│                                                          │
│  ── Location ──────────────────────────────────          │
│  City               [________________]                   │
│  Country            [________________]                   │
│  Work Mode          [Remote ▾]                           │
│  Other              [________________]                   │
│                                                          │
│  Date Applied *     [2026-03-22]  (defaults to today)    │
│                                                          │
│  ── Job Description ───────────────────────────          │
│  Job Posting URL    [________________________]           │
│  Paste JD Text      ┌────────────────────────┐           │
│                     │                        │           │
│                     │  (textarea, optional)  │           │
│                     │                        │           │
│                     └────────────────────────┘           │
│                                                          │
│  ── Note ──────────────────────────────────────          │
│  Files (resume, cover letter, JD file) can be            │
│  uploaded after creation from the detail page.           │
│                                                          │
│             [Cancel]              [Create Application]   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Create Modal — Fields

| Field            | Type       | Required | Validation                            |
| ---------------- | ---------- | -------- | ------------------------------------- |
| Company          | Text input | Yes      | Max 200 chars                         |
| Role / Title     | Text input | Yes      | Max 200 chars                         |
| City             | Text input | No       |                                       |
| Country          | Text input | No       |                                       |
| Work Mode        | Dropdown   | No       | Remote / Hybrid / Onsite              |
| Other (location) | Text input | No       |                                       |
| Date Applied     | Date input | Yes      | YYYY-MM-DD, not future, default today |
| Job Posting URL  | Text input | No       | Valid URL                             |
| JD Text          | Textarea   | No       | Max 50,000 chars                      |

- Status is automatically set to **"Applying"** (not user-selectable on create).
- Files are uploaded separately on the detail page after creation.

---

## 4. Application Detail Page

**Route:** `/applications/:id`
**Purpose:** View and edit all details of a single application, manage interviews, upload/download files, change status.

```
┌──────────────────────────────────────────────────────────────────────┐
│  📋 Job Tracker    [Applications]   [Dashboard]   [Trash]   [Logout]│
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [← Back to Applications]                                            │
│                                                                      │
│  ┌─── Header ───────────────────────────────────────────────────┐    │
│  │                                                               │    │
│  │  Contoso Ltd                                                  │    │
│  │  Senior Cloud Engineer                                        │    │
│  │  📍 Sydney, Australia · Hybrid    📅 Applied: 2026-03-15     │    │
│  │                                                               │    │
│  │  Status: [Interview Stage ▾]                    [🗑 Delete]  │    │
│  │                                                               │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─── Details (editable) ───────────────────────────────────────┐    │
│  │                                                               │    │
│  │  Company        [Contoso Ltd_________] [✏]                   │    │
│  │  Role           [Senior Cloud Engineer] [✏]                  │    │
│  │  City           [Sydney______________] [✏]                   │    │
│  │  Country        [Australia___________] [✏]                   │    │
│  │  Work Mode      [Hybrid ▾]                                    │    │
│  │  Date Applied   [2026-03-15]                                  │    │
│  │  Job Posting    [https://careers.contoso.com/...] [🔗]       │    │
│  │                                                               │    │
│  │  JD Text:       ┌────────────────────────────────┐            │    │
│  │                 │ We are looking for a Senior... │            │    │
│  │                 └────────────────────────────────┘            │    │
│  │                                                               │    │
│  │                                [Save Changes]                 │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─── Files ────────────────────────────────────────────────────┐    │
│  │                                                               │    │
│  │  Resume           contoso-resume.pdf                          │    │
│  │                   Uploaded: 2026-03-15 10:30                  │    │
│  │                   [⬇ Download]  [🔄 Re-upload]  [🗑 Remove] │    │
│  │                                                               │    │
│  │  Cover Letter     contoso-cl.pdf                              │    │
│  │                   Uploaded: 2026-03-15 10:30                  │    │
│  │                   [⬇ Download]  [🔄 Re-upload]  [🗑 Remove] │    │
│  │                                                               │    │
│  │  Job Description  (no file uploaded)                          │    │
│  │                   [📤 Upload File]                            │    │
│  │                   Accepts: PDF, DOCX, HTML · Max 10 MB        │    │
│  │                                                               │    │
│  │  ┌── Upload Progress (shown during upload) ──────────────┐   │    │
│  │  │  Uploading contoso-resume.pdf...  ████████░░░░  67%   │   │    │
│  │  └───────────────────────────────────────────────────────┘   │    │
│  │                                                               │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─── Rejection (shown when status = Rejected) ─────────────────┐   │
│  │                                                               │    │
│  │  Reason:  [Failed Technical ▾]                                │    │
│  │  Notes:   ┌────────────────────────────────────────┐          │    │
│  │           │ Couldn't solve the system design...    │          │    │
│  │           └────────────────────────────────────────┘          │    │
│  │                                            [Save]             │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─── Interviews ───────────────────────────────────────────────┐    │
│  │                                                               │    │
│  │  2 interview rounds                    [+ Add Interview]      │    │
│  │                                                               │    │
│  │  ┌─ Round 1 ─────────────────────────────────────────────┐    │    │
│  │  │  ≡ (drag handle)                                      │    │    │
│  │  │  Type: Phone Screen    Date: 2026-03-20               │    │    │
│  │  │  Interviewer(s): Jane Smith, Senior Manager            │    │    │
│  │  │  Outcome: [Passed ✅]                                  │    │    │
│  │  │                                                        │    │    │
│  │  │  Notes: Asked about Azure experience                   │    │    │
│  │  │  Reflection: Felt confident                            │    │    │
│  │  │                                                        │    │    │
│  │  │  [Edit]  [Delete]                                      │    │    │
│  │  └────────────────────────────────────────────────────────┘    │    │
│  │                                                               │    │
│  │  ┌─ Round 2 ─────────────────────────────────────────────┐    │    │
│  │  │  ≡ (drag handle)                                      │    │    │
│  │  │  Type: Technical       Date: 2026-03-25               │    │    │
│  │  │  Interviewer(s): Bob Chen, Principal Engineer          │    │    │
│  │  │  Outcome: [Failed ❌]                                  │    │    │
│  │  │                                                        │    │    │
│  │  │  Notes: System design question                         │    │    │
│  │  │  Reflection: Struggled with caching layer              │    │    │
│  │  │                                                        │    │    │
│  │  │  [Edit]  [Delete]                                      │    │    │
│  │  └────────────────────────────────────────────────────────┘    │    │
│  │                                                               │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Updated: 2026-03-25 16:00 · Created: 2026-03-15 10:30              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Add/Edit Interview Modal

```
┌──────────────────────────────────────────────────────────┐
│  ✕               Add Interview Round                     │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Type *            [Technical ▾]                         │
│                    Phone Screen | Technical | Behavioral │
│                    Case Study | Panel | Take Home | Other│
│                                                          │
│  Date *            [2026-03-25]                          │
│                                                          │
│  Interviewer(s)    [________________________]            │
│                    (free text, max 500 chars)             │
│                                                          │
│  Outcome *         [Pending ▾]                           │
│                    Passed | Failed | Pending | Cancelled  │
│                                                          │
│  Notes             ┌────────────────────────┐            │
│                    │                        │            │
│                    │                        │            │
│                    └────────────────────────┘            │
│                    (max 10,000 chars)                     │
│                                                          │
│  Reflection        ┌────────────────────────┐            │
│  (for future AI)   │                        │            │
│                    │                        │            │
│                    └────────────────────────┘            │
│                    (max 10,000 chars)                     │
│                                                          │
│             [Cancel]                [Save Interview]      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Detail Page — Interactions

| Element              | Action                                                            |
| -------------------- | ----------------------------------------------------------------- |
| **Status dropdown**  | Change status → PATCH, shows rejection section if Rejected        |
| **Edit fields**      | Inline editing → PATCH on save                                    |
| **Upload file**      | Client validation → SAS token → PUT to blob → poll for completion |
| **Download file**    | GET download SAS token → open URL in new tab                      |
| **Remove file**      | Confirmation → DELETE file endpoint                               |
| **Re-upload file**   | Same flow as upload (overwrites previous)                         |
| **Add Interview**    | Opens modal → POST                                                |
| **Edit Interview**   | Opens modal pre-filled → PATCH                                    |
| **Delete Interview** | Confirmation → DELETE                                             |
| **Drag interviews**  | Reorder via drag & drop → PATCH reorder                           |
| **Delete app**       | Confirmation dialog → soft DELETE → redirect to list              |

---

## 5. Dashboard / Stats Page

**Route:** `/dashboard`
**Purpose:** View summary statistics across all applications for a configurable time period.

```
┌──────────────────────────────────────────────────────────────────────┐
│  📋 Job Tracker    [Applications]   [Dashboard]   [Trash]   [Logout]│
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Dashboard                                                           │
│                                                                      │
│  Period:  From [2026-03-01]  To [2026-03-22]   [Apply]              │
│                                                                      │
│  ┌─── Summary Cards ────────────────────────────────────────────┐    │
│  │                                                               │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │    │
│  │  │    47    │  │    18    │  │    14    │  │     2    │     │    │
│  │  │  Total   │  │  Active  │  │ Rejected │  │ Accepted │     │    │
│  │  │  Apps    │  │  (in     │  │          │  │          │     │    │
│  │  │          │  │ progress)│  │          │  │          │     │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │    │
│  │                                                               │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─── Applications by Status ───────────────────────────────────┐    │
│  │                                                               │    │
│  │  Applying              ███░░░░░░░░░░░░░░░░░░░░░░░░░░   3    │    │
│  │  Application Submitted ████████░░░░░░░░░░░░░░░░░░░░░  12    │    │
│  │  Recruiter Screening   ██████░░░░░░░░░░░░░░░░░░░░░░░   8    │    │
│  │  Interview Stage       ████░░░░░░░░░░░░░░░░░░░░░░░░░   5    │    │
│  │  Pending Offer         █░░░░░░░░░░░░░░░░░░░░░░░░░░░░   1    │    │
│  │  Accepted              ██░░░░░░░░░░░░░░░░░░░░░░░░░░░   2    │    │
│  │  Rejected              ██████████░░░░░░░░░░░░░░░░░░░  14    │    │
│  │  Withdrawn             ██░░░░░░░░░░░░░░░░░░░░░░░░░░░   2    │    │
│  │                                                               │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─── Interviews by Type ───────────────────────────────────────┐    │
│  │                                                               │    │
│  │  Total Interviews: 18                                         │    │
│  │                                                               │    │
│  │  Phone Screen    ████████████████░░░░░░░░░░░░░░░░░░░   8    │    │
│  │  Technical       ██████████░░░░░░░░░░░░░░░░░░░░░░░░░   5    │    │
│  │  Behavioral      ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   3    │    │
│  │  Case Study      ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   1    │    │
│  │  Panel           ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   1    │    │
│  │  Take Home Test  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0    │    │
│  │  Other           ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0    │    │
│  │                                                               │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─── Quick Insights ───────────────────────────────────────────┐    │
│  │                                                               │    │
│  │  • Response rate: 34 of 47 apps got a response (72%)          │    │
│  │  • Most common rejection: Ghosted (6)                         │    │
│  │  • Average time to first interview: ~8 days                   │    │
│  │                                                               │    │
│  │  (v2: AI-powered analysis will appear here)                   │    │
│  │                                                               │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Dashboard — Data Source

All data comes from `GET /api/applications/stats?from=...&to=...`.

| Section            | Source field         |
| ------------------ | -------------------- |
| Total Apps         | `totalApplications`  |
| By Status bars     | `byStatus.*`         |
| Total Interviews   | `totalInterviews`    |
| Interviews by Type | `interviewsByType.*` |
| Quick Insights     | Derived client-side  |

> **Note:** "Quick Insights" section is computed client-side from the stats response. This is a v1 placeholder — v2 will use AI analysis (R7/R8).

---

## 6. Deleted Applications Page

**Route:** `/deleted`
**Purpose:** View recently soft-deleted applications and restore them.

```
┌──────────────────────────────────────────────────────────────────────┐
│  📋 Job Tracker    [Applications]   [Dashboard]   [Trash]   [Logout]│
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  🗑 Recently Deleted                                                 │
│                                                                      │
│  These applications have been soft-deleted. You can restore them     │
│  or they will remain hidden from your main list and stats.           │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Widgetworks · Junior Dev                                   │    │
│  │  📍 Remote    📅 Applied: 2026-03-05                        │    │
│  │  Status: Rejected · Ghosted                                  │    │
│  │  Deleted: 2026-03-19 09:00                                   │    │
│  │                                        [🔄 Restore]          │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  OldCorp · Data Analyst                                     │    │
│  │  📍 Perth, Australia · Onsite   📅 Applied: 2026-02-28     │    │
│  │  Status: Withdrawn                                           │    │
│  │  Deleted: 2026-03-18 14:22                                   │    │
│  │                                        [🔄 Restore]          │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ── No more deleted applications ──                                  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Interactions

| Element        | Action                                           |
| -------------- | ------------------------------------------------ |
| **Restore**    | PATCH `/:id/restore` → removes from this list    |
| **Card click** | No navigation — detail view not needed for trash |

---

## 7. Shared Components

### 7.1 Navigation Bar

Present on all authenticated pages.

```
┌──────────────────────────────────────────────────────────────────────┐
│  📋 Job Tracker    [Applications]   [Dashboard]   [Trash]   [Logout]│
└──────────────────────────────────────────────────────────────────────┘
```

- Active page link is highlighted.
- **Logout** navigates to `/.auth/logout`.

### 7.2 Confirmation Dialog

Used for destructive actions (delete application, delete interview, remove file).

```
┌──────────────────────────────────────┐
│  ⚠ Confirm Delete                    │
│                                      │
│  Are you sure you want to delete     │
│  this application? You can restore   │
│  it from the Trash page.             │
│                                      │
│        [Cancel]      [Delete]        │
└──────────────────────────────────────┘
```

### 7.3 Toast Notifications

Shown for success/error feedback (bottom-right corner).

```
┌────────────────────────────────────┐
│ ✅ Application created             │
│    Contoso Ltd · Cloud Engineer    │
│                             [✕]    │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ ❌ Upload failed                   │
│    File exceeds 10 MB limit        │
│                             [✕]    │
└────────────────────────────────────┘
```

### 7.4 Loading States

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│              ⟳ Loading applications...                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 7.5 Empty States

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│        📋 No applications yet                                    │
│                                                                  │
│        Start tracking your job search by                         │
│        creating your first application.                          │
│                                                                  │
│              [+ New Application]                                 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 7.6 Status Badge Colours

| Status                | Colour     | Indicator |
| --------------------- | ---------- | --------- |
| Applying              | Grey/Slate | ⚪        |
| Application Submitted | Blue       | 🔵        |
| Recruiter Screening   | Cyan       | 🔵        |
| Interview Stage       | Purple     | 🟣        |
| Pending Offer         | Amber      | 🟡        |
| Accepted              | Green      | 🟢        |
| Rejected              | Red        | 🔴        |
| Withdrawn             | Orange     | 🟠        |

---

## 8. Design Notes

### Auth Model Reminder

The backend is built for **Azure SWA built-in GitHub auth**, not custom username/password. The login page is effectively a single GitHub OAuth button. This is simpler and more secure for a single-user personal app. The `x-ms-client-principal` header with the `owner` role controls access.

### API Base URL

Frontend calls the Function App directly (not proxied through SWA, since Free tier doesn't support linked backends).

```
const API_BASE = import.meta.env.VITE_API_URL || 'https://func-jobtracker.azurewebsites.net';
```

### File Upload Flow (UX)

1. User clicks **Upload** on the detail page.
2. Client validates: file extension (PDF/DOCX/HTML) + file size (≤ 10 MB).
3. If invalid → inline error, no API call.
4. If valid → POST `/api/upload/sas-token` to get an upload URL.
5. PUT file to blob storage using `XMLHttpRequest` (progress bar shown).
6. On PUT success → poll `GET /:id` every 2s (max 15s) until `uploadedAt` updates.
7. Show success toast when file metadata appears, or "Processing..." if timeout.

### Responsive Design

- Desktop-first layout (primary use case is desktop/laptop).
- Cards stack vertically on smaller screens.
- Nav links collapse to a hamburger menu on mobile.

### Component Library — Decision: Shadcn/ui + Tailwind CSS

**Decided:** 2026-03-22

**Choice:** Shadcn/ui (copy-paste components built on Radix UI + Tailwind CSS)

**Why Shadcn/ui over alternatives:**

| Factor            | Shadcn/ui advantage                                                          |
| ----------------- | ---------------------------------------------------------------------------- |
| **Bundle size**   | Components copied into project, not an npm dependency — minimal footprint    |
| **Table support** | Built-in DataTable wrapping TanStack Table — sortable, paginated, filterable |
| **Accessibility** | Built on Radix UI primitives — proper ARIA for Dialog, Select, Popover, etc. |
| **TypeScript**    | First-class TS support, matches project conventions                          |
| **Customisation** | You own the code — no fighting library themes. Good for portfolio piece      |
| **Vite**          | Works natively with Vite, zero config hacks                                  |

**Why not:**

- **MUI** — Heavy (~300KB+), opinionated Material Design, overkill for single-user app
- **Ant Design** — Large, enterprise-focused, harder to customise
- **Mantine** — Good but installed as npm dep (less control), larger footprint
- **Plain CSS** — No accessibility primitives — would have to reimplement Dialog, Select, etc.

**Shadcn components to use:**

| Wireframe element        | Shadcn component                     |
| ------------------------ | ------------------------------------ |
| Data table (Excel-style) | `DataTable` (TanStack Table wrapper) |
| Create/Edit modals       | `Dialog`                             |
| Status dropdowns         | `Select`                             |
| Filter bar               | `Select` + `DatePicker` + `Button`   |
| Date inputs              | `DatePicker` (react-day-picker)      |
| File upload progress     | `Progress`                           |
| Toast notifications      | `Sonner` (built-in toast)            |
| Confirmation dialogs     | `AlertDialog`                        |
| Status badges            | `Badge`                              |
| Form validation          | `Form` (react-hook-form + zod)       |
| Navigation               | `NavigationMenu`                     |

**Additional libraries alongside Shadcn:**

| Library               | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| TanStack Table        | Comes with Shadcn DataTable — sorting, pagination, filtering |
| react-hook-form + zod | Form state + validation (Shadcn Form wraps these)            |
| @dnd-kit/core         | Interview round drag-to-reorder (lightweight, accessible)    |
| recharts (optional)   | Dashboard bar/pie charts if desired beyond text bars         |

### Testing Strategy — Decision: Vitest + React Testing Library + MSW

**Decided:** 2026-03-22

Frontend testing uses a **different approach** from backend unit testing. Backend tests mock at the module level (Cosmos client, storage client). Frontend tests focus on **what the user sees and does**, not component internals.

**Testing stack:**

| Tool                            | Role                        | Why                                                                                                                                        |
| ------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Vitest**                      | Test runner                 | Already used for backend — one test runner for entire project, fast, Vite-native                                                           |
| **React Testing Library**       | Component testing           | Tests user behaviour (click button, see text), not implementation details (state, refs). Industry standard for React                       |
| **MSW (Mock Service Worker)**   | API mocking                 | Intercepts `fetch`/`XHR` at the network level — tests hit real `fetch()` calls but MSW returns mock data. No need to mock `fetch` manually |
| **@testing-library/user-event** | User interaction simulation | Realistic event firing (typing, clicking, tabbing) vs. raw `fireEvent`                                                                     |
| **jsdom**                       | DOM environment             | Vitest uses jsdom to simulate browser DOM in Node.js                                                                                       |

**Why not other options:**

| Tool                    | Why not                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- |
| **Jest**                | Would add a second test runner — Vitest is already in the project and faster |
| **Enzyme**              | Deprecated, tests implementation details (shallow rendering)                 |
| **Cypress (component)** | Heavier, spins up real browser — overkill for component tests                |
| **Playwright**          | E2E tool — useful later (Phase 5/6) but not for component-level testing      |

**Testing layers for v1:**

| Layer             | Tool                | What it tests                                                       |
| ----------------- | ------------------- | ------------------------------------------------------------------- |
| **Component**     | Vitest + RTL + MSW  | Individual components render, respond to clicks, call API correctly |
| **Integration**   | Vitest + RTL + MSW  | Full page renders, form submission → API call → UI update           |
| **E2E (Phase 6)** | Playwright (future) | Full browser, real app, login → create → edit → delete flow         |

**Example test pattern:**

```tsx
// ApplicationsTable.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../mocks/server';       // MSW server
import { http, HttpResponse } from 'msw';
import { ApplicationsTable } from './ApplicationsTable';

test('renders applications in table rows', async () => {
  render(<ApplicationsTable />);
  expect(await screen.findByText('Contoso Ltd')).toBeInTheDocument();
  expect(screen.getByText('Senior Cloud Engineer')).toBeInTheDocument();
});

test('clicking a row navigates to detail page', async () => {
  render(<ApplicationsTable />);
  const row = await screen.findByText('Contoso Ltd');
  await userEvent.click(row);
  // assert navigation happened
});

test('shows empty state when no applications', async () => {
  server.use(
    http.get('*/api/applications', () =>
      HttpResponse.json({ data: { items: [], pagination: { ... } }, error: null })
    )
  );
  render(<ApplicationsTable />);
  expect(await screen.findByText('No applications yet')).toBeInTheDocument();
});
```

---

## Page Summary

| #   | Page                 | Route               | API Endpoints Used                                 |
| --- | -------------------- | ------------------- | -------------------------------------------------- |
| 1   | Login                | `/login`            | SWA built-in (`/.auth/*`)                          |
| 2   | Applications List    | `/`                 | GET /api/applications                              |
| 3   | Application Detail   | `/applications/:id` | GET, PATCH, DELETE /:id + interviews + files + SAS |
| 4   | Dashboard            | `/dashboard`        | GET /api/applications/stats                        |
| 5   | Deleted Applications | `/deleted`          | GET /api/applications/deleted, PATCH /:id/restore  |
