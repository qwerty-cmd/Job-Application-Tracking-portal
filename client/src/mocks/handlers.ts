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
  // List applications
  http.get(`${API_BASE}/applications`, () => {
    const items = [...db.values()].filter((a) => !a.isDeleted).map(toSummary);
    return HttpResponse.json({
      data: {
        items,
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: items.length,
          totalPages: 1,
        },
      },
      error: null,
    });
  }),

  // Stats — MUST be before :id to avoid parameterized match
  http.get(`${API_BASE}/applications/stats`, () => {
    const active = [...db.values()].filter((a) => !a.isDeleted);
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
    for (const app of active) {
      byStatus[app.status] = (byStatus[app.status] ?? 0) + 1;
      for (const iv of app.interviews) {
        interviewsByType[iv.type] = (interviewsByType[iv.type] ?? 0) + 1;
        totalInterviews++;
      }
    }
    const stats: StatsResponse = {
      period: { from: "2026-03-01", to: "2026-03-31" },
      totalApplications: active.length,
      byStatus,
      totalInterviews,
      interviewsByType,
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
