import { http, HttpResponse } from "msw";
import type { Application, ApplicationSummary, StatsResponse } from "@/types";

// Base URL — in tests, MSW intercepts relative URLs too
const API_BASE = "/api";

// --- Seed Data ---

export const mockApplication: Application = {
  id: "app-1",
  company: "Contoso Ltd",
  role: "Senior Cloud Engineer",
  location: {
    city: "Sydney",
    country: "Australia",
    workMode: "Hybrid",
    other: null,
  },
  dateApplied: "2026-03-15",
  jobPostingUrl: "https://careers.contoso.com/job/12345",
  jobDescriptionText: "We are looking for a Senior Cloud Engineer...",
  jobDescriptionFile: null,
  status: "Interview Stage",
  resume: {
    fileName: "contoso-resume.pdf",
    uploadedAt: "2026-03-15T10:30:00Z",
  },
  coverLetter: {
    fileName: "contoso-cl.pdf",
    uploadedAt: "2026-03-15T10:30:05Z",
  },
  rejection: null,
  interviews: [
    {
      id: "int-1",
      round: 1,
      type: "Phone Screen",
      date: "2026-03-20",
      interviewers: "Jane Smith",
      notes: "Asked about Azure experience",
      reflection: "Felt confident",
      outcome: "Passed",
      order: 1,
    },
  ],
  isDeleted: false,
  deletedAt: null,
  createdAt: "2026-03-15T10:30:00Z",
  updatedAt: "2026-03-25T16:00:00Z",
};

// --- In-Memory Store (persists across requests within the browser session) ---

let nextId = 2;
const db: Map<string, Application> = new Map();
db.set(mockApplication.id, structuredClone(mockApplication));

function findApp(id: string): Application | undefined {
  const app = db.get(id as string);
  if (app && !app.isDeleted) return app;
  return undefined;
}

function toSummary(app: Application): ApplicationSummary {
  return {
    id: app.id,
    company: app.company,
    role: app.role,
    location: app.location,
    dateApplied: app.dateApplied,
    status: app.status,
    jobPostingUrl: app.jobPostingUrl,
    hasResume: app.resume !== null,
    hasCoverLetter: app.coverLetter !== null,
    hasJobDescription:
      app.jobDescriptionFile !== null || app.jobDescriptionText !== null,
    interviewCount: app.interviews.length,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

function notFound(id: string) {
  return HttpResponse.json(
    {
      data: null,
      error: { code: "NOT_FOUND", message: `Application ${id} not found` },
    },
    { status: 404 },
  );
}

// Re-export for test compatibility
export const mockSummary: ApplicationSummary = toSummary(mockApplication);

// --- Handlers ---

export const handlers = [
  // List applications (with filtering, sorting, pagination)
  http.get(`${API_BASE}/applications`, ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const sortBy = url.searchParams.get("sortBy") ?? "dateApplied";
    const sortOrder = url.searchParams.get("sortOrder") ?? "desc";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)),
    );

    let results = [...db.values()].filter((a) => !a.isDeleted);

    // Status filter
    if (status) {
      results = results.filter((a) => a.status === status);
    }
    // Date range filter
    if (from) {
      results = results.filter((a) => a.dateApplied >= from);
    }
    if (to) {
      results = results.filter((a) => a.dateApplied <= to);
    }

    // Sort
    results.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortBy] as string;
      const bVal = (b as unknown as Record<string, unknown>)[sortBy] as string;
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    // Pagination
    const totalItems = results.length;
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
    const offset = (page - 1) * pageSize;
    const items = results.slice(offset, offset + pageSize).map(toSummary);

    return HttpResponse.json({
      data: {
        items,
        pagination: { page, pageSize, totalItems, totalPages },
      },
      error: null,
    });
  }),

  // Stats — MUST be before :id to avoid parameterized match
  http.get(`${API_BASE}/applications/stats`, ({ request }) => {
    const url = new URL(request.url);
    const now = new Date();
    const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const defaultTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const from = url.searchParams.get("from") ?? defaultFrom;
    const to = url.searchParams.get("to") ?? defaultTo;

    const active = [...db.values()].filter(
      (a) => !a.isDeleted && a.dateApplied >= from && a.dateApplied <= to,
    );
    const byStatus: Record<string, number> = {
      Applying: 0,
      "Application Submitted": 0,
      "Recruiter Screening": 0,
      "Interview Stage": 0,
      "Pending Offer": 0,
      Accepted: 0,
      Rejected: 0,
      Withdrawn: 0,
    };
    const interviewsByType: Record<string, number> = {
      "Phone Screen": 0,
      Technical: 0,
      Behavioral: 0,
      "Case Study": 0,
      Panel: 0,
      "Take Home Test": 0,
      Other: 0,
    };
    let totalInterviews = 0;
    // outcomesByStage: where did ended/stalled applications land?
    const outcomesByStage: Record<string, number> = {
      "No Response": 0,
      "Pre-Interview": 0,
      "Phone Screen": 0,
      "Take Home Test": 0,
      Technical: 0,
      Behavioral: 0,
      "Case Study": 0,
      Panel: 0,
      Other: 0,
    };
    for (const app of active) {
      byStatus[app.status] = (byStatus[app.status] ?? 0) + 1;
      for (const iv of app.interviews) {
        interviewsByType[iv.type] = (interviewsByType[iv.type] ?? 0) + 1;
        totalInterviews++;
      }
      // Classify ended/stalled applications
      if (app.status === "Rejected" || app.status === "Withdrawn") {
        if (app.interviews.length > 0) {
          // Furthest interview stage reached
          const last = app.interviews[app.interviews.length - 1];
          outcomesByStage[last.type] = (outcomesByStage[last.type] ?? 0) + 1;
        } else {
          outcomesByStage["Pre-Interview"] += 1;
        }
      } else if (
        app.status === "Applying" ||
        app.status === "Application Submitted"
      ) {
        // No response yet
        outcomesByStage["No Response"] += 1;
      }
    }
    const stats: StatsResponse = {
      period: { from, to },
      totalApplications: active.length,
      byStatus,
      totalInterviews,
      interviewsByType,
      outcomesByStage,
    };
    return HttpResponse.json({ data: stats, error: null });
  }),

  // Deleted list — MUST be before :id to avoid parameterized match
  http.get(`${API_BASE}/applications/deleted`, () => {
    const items = [...db.values()]
      .filter((a) => a.isDeleted)
      .map((a) => ({ ...toSummary(a), deletedAt: a.deletedAt }));
    return HttpResponse.json({ data: { items }, error: null });
  }),

  // Get single application
  http.get(`${API_BASE}/applications/:id`, ({ params }) => {
    const app = findApp(params.id as string);
    if (!app) return notFound(params.id as string);
    return HttpResponse.json({ data: app, error: null });
  }),

  // Create application
  http.post(`${API_BASE}/applications`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();
    const id = `app-${nextId++}`;
    const created: Application = {
      id,
      company: (body.company as string) ?? "New Company",
      role: (body.role as string) ?? "New Role",
      location: (body.location as Application["location"]) ?? {
        city: "",
        country: "",
        workMode: "Remote",
        other: null,
      },
      dateApplied: (body.dateApplied as string) ?? now.slice(0, 10),
      jobPostingUrl: (body.jobPostingUrl as string) ?? null,
      jobDescriptionText: (body.jobDescriptionText as string) ?? null,
      jobDescriptionFile: null,
      status: "Applying",
      resume: null,
      coverLetter: null,
      rejection: null,
      interviews: [],
      isDeleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.set(id, created);
    return HttpResponse.json({ data: created, error: null }, { status: 201 });
  }),

  // Update application
  http.patch(`${API_BASE}/applications/:id`, async ({ params, request }) => {
    const app = findApp(params.id as string);
    if (!app) return notFound(params.id as string);
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(app, body, { updatedAt: new Date().toISOString() });
    return HttpResponse.json({ data: app, error: null });
  }),

  // Delete application (soft)
  http.delete(`${API_BASE}/applications/:id`, ({ params }) => {
    const app = findApp(params.id as string);
    if (!app) return notFound(params.id as string);
    app.isDeleted = true;
    app.deletedAt = new Date().toISOString();
    return HttpResponse.json({
      data: { id: params.id, deleted: true },
      error: null,
    });
  }),

  // Restore application
  http.patch(`${API_BASE}/applications/:id/restore`, ({ params }) => {
    const app = db.get(params.id as string);
    if (!app || !app.isDeleted) return notFound(params.id as string);
    app.isDeleted = false;
    app.deletedAt = null;
    return HttpResponse.json({ data: app, error: null });
  }),

  // Add interview
  http.post(
    `${API_BASE}/applications/:id/interviews`,
    async ({ params, request }) => {
      const app = findApp(params.id as string);
      if (!app) return notFound(params.id as string);
      const body = (await request.json()) as Record<string, unknown>;
      const newInterview = {
        id: `int-${Date.now()}`,
        round: app.interviews.length + 1,
        order: app.interviews.length + 1,
        ...body,
      };
      app.interviews.push(newInterview as Application["interviews"][number]);
      app.updatedAt = new Date().toISOString();
      if (
        ["Applying", "Application Submitted", "Recruiter Screening"].includes(
          app.status,
        )
      ) {
        app.status = "Interview Stage";
      }
      return HttpResponse.json({ data: app, error: null }, { status: 201 });
    },
  ),

  // Update interview
  http.patch(
    `${API_BASE}/applications/:id/interviews/:interviewId`,
    async ({ params, request }) => {
      const app = findApp(params.id as string);
      if (!app) return notFound(params.id as string);
      const body = (await request.json()) as Record<string, unknown>;
      const idx = app.interviews.findIndex((i) => i.id === params.interviewId);
      if (idx === -1) {
        return HttpResponse.json(
          {
            data: null,
            error: {
              code: "NOT_FOUND",
              message: `Interview ${params.interviewId} not found`,
            },
          },
          { status: 404 },
        );
      }
      Object.assign(app.interviews[idx], body);
      app.updatedAt = new Date().toISOString();
      return HttpResponse.json({ data: app, error: null });
    },
  ),

  // Delete interview
  http.delete(
    `${API_BASE}/applications/:id/interviews/:interviewId`,
    ({ params }) => {
      const app = findApp(params.id as string);
      if (!app) return notFound(params.id as string);
      app.interviews = app.interviews.filter(
        (i) => i.id !== params.interviewId,
      );
      app.updatedAt = new Date().toISOString();
      return HttpResponse.json({ data: app, error: null });
    },
  ),

  // Reorder interviews
  http.patch(
    `${API_BASE}/applications/:id/interviews/reorder`,
    async ({ params, request }) => {
      const app = findApp(params.id as string);
      if (!app) return notFound(params.id as string);
      const body = (await request.json()) as { order: string[] };
      const reordered = body.order
        .map((id, idx) => {
          const found = app.interviews.find((i) => i.id === id);
          return found ? { ...found, order: idx + 1 } : undefined;
        })
        .filter(Boolean) as Application["interviews"];
      app.interviews = reordered;
      app.updatedAt = new Date().toISOString();
      return HttpResponse.json({ data: app, error: null });
    },
  ),

  // Delete file
  http.delete(`${API_BASE}/applications/:id/files/:fileType`, ({ params }) => {
    const app = findApp(params.id as string);
    if (!app) return notFound(params.id as string);
    const field = params.fileType as
      | "resume"
      | "coverLetter"
      | "jobDescriptionFile";
    if (field === "resume") app.resume = null;
    else if (field === "coverLetter") app.coverLetter = null;
    else if (field === "jobDescriptionFile") app.jobDescriptionFile = null;
    app.updatedAt = new Date().toISOString();
    return HttpResponse.json({
      data: { id: params.id, fileType: params.fileType, deleted: true },
      error: null,
    });
  }),

  // Upload SAS token
  http.post(`${API_BASE}/upload/sas-token`, () => {
    return HttpResponse.json({
      data: {
        uploadUrl:
          "https://storage.blob.core.windows.net/resumes/app-1/123-resume.pdf?sig=mock",
        blobPath: "resumes/app-1/123-resume.pdf",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      },
      error: null,
    });
  }),

  // Download SAS token
  http.get(`${API_BASE}/download/sas-token`, () => {
    return HttpResponse.json({
      data: {
        downloadUrl:
          "https://storage.blob.core.windows.net/resumes/app-1/123-resume.pdf?sig=mock",
        fileName: "resume.pdf",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      },
      error: null,
    });
  }),

  // SWA auth endpoint
  http.get("/.auth/me", () => {
    return HttpResponse.json({
      clientPrincipal: {
        identityProvider: "github",
        userId: "test-user-id",
        userDetails: "testuser",
        userRoles: ["authenticated", "owner"],
      },
    });
  }),
];
