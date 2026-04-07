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
    {
      id: "int-2",
      round: 2,
      type: "Technical",
      date: "2026-03-28",
      interviewers: "Bob Jones",
      notes: "Live coding + system design",
      reflection: "Need to practice more on system design",
      outcome: "Pending",
      order: 2,
    },
  ],
  history: [
    {
      id: "evt-1",
      type: "application_created",
      timestamp: "2026-03-15T10:30:00Z",
      description: "Application created",
    },
    {
      id: "evt-2",
      type: "status_changed",
      timestamp: "2026-03-18T14:00:00Z",
      description: "Status changed to Interview Stage",
    },
    {
      id: "evt-3",
      type: "file_uploaded",
      timestamp: "2026-03-15T10:30:00Z",
      description: "File uploaded: contoso-resume.pdf (resume)",
    },
    {
      id: "evt-4",
      type: "interview_added",
      timestamp: "2026-03-18T14:00:00Z",
      description: "Interview added: Phone Screen (Round 1)",
    },
  ],
  isDeleted: false,
  deletedAt: null,
  createdAt: "2026-03-15T10:30:00Z",
  updatedAt: "2026-03-25T16:00:00Z",
};

const app2: Application = {
  id: "app-2",
  company: "Fabrikam Corp",
  role: "Platform Engineer",
  location: { city: "Melbourne", country: "Australia", workMode: "Onsite", other: null },
  dateApplied: "2026-03-05",
  jobPostingUrl: "https://fabrikam.com/careers/42",
  jobDescriptionText: "Platform Engineer role at Fabrikam...",
  jobDescriptionFile: null,
  status: "Accepted",
  resume: { fileName: "fabrikam-resume.pdf", uploadedAt: "2026-03-05T09:00:00Z" },
  coverLetter: null,
  rejection: null,
  interviews: [
    { id: "int-21", round: 1, type: "Phone Screen", date: "2026-03-10", interviewers: "HR Team", notes: "", reflection: "", outcome: "Passed", order: 1 },
    { id: "int-22", round: 2, type: "Technical", date: "2026-03-17", interviewers: "Engineering Lead", notes: "Kubernetes deep dive", reflection: "Strong performance", outcome: "Passed", order: 2 },
    { id: "int-23", round: 3, type: "Panel", date: "2026-03-24", interviewers: "VP Engineering, CTO", notes: "Culture fit and leadership", reflection: "Great energy", outcome: "Passed", order: 3 },
  ],
  history: [
    { id: "evt-21", type: "application_created", timestamp: "2026-03-05T09:00:00Z", description: "Application created" },
    { id: "evt-22", type: "status_changed", timestamp: "2026-03-24T17:00:00Z", description: "Status changed to Accepted" },
  ],
  isDeleted: false,
  deletedAt: null,
  createdAt: "2026-03-05T09:00:00Z",
  updatedAt: "2026-03-25T10:00:00Z",
};

const app3: Application = {
  id: "app-3",
  company: "Northwind Inc",
  role: "DevOps Engineer",
  location: { city: "Brisbane", country: "Australia", workMode: "Remote", other: null },
  dateApplied: "2026-03-08",
  jobPostingUrl: null,
  jobDescriptionText: null,
  jobDescriptionFile: { fileName: "northwind-jd.pdf", uploadedAt: "2026-03-08T11:00:00Z" },
  status: "Rejected",
  resume: { fileName: "northwind-resume.pdf", uploadedAt: "2026-03-08T11:00:00Z" },
  coverLetter: null,
  rejection: { reason: "Failed Technical", notes: "Did not pass the live coding round" },
  interviews: [
    { id: "int-31", round: 1, type: "Technical", date: "2026-03-14", interviewers: "Senior Dev", notes: "Algorithm challenge", reflection: "Struggled with the dynamic programming question", outcome: "Failed", order: 1 },
  ],
  history: [
    { id: "evt-31", type: "application_created", timestamp: "2026-03-08T11:00:00Z", description: "Application created" },
    { id: "evt-32", type: "status_changed", timestamp: "2026-03-14T16:00:00Z", description: "Status changed to Rejected" },
  ],
  isDeleted: false,
  deletedAt: null,
  createdAt: "2026-03-08T11:00:00Z",
  updatedAt: "2026-03-14T16:00:00Z",
};

const app4: Application = {
  id: "app-4",
  company: "Litware Solutions",
  role: "Site Reliability Engineer",
  location: { city: "Perth", country: "Australia", workMode: "Hybrid", other: null },
  dateApplied: "2026-03-18",
  jobPostingUrl: "https://litware.io/jobs/sre",
  jobDescriptionText: "SRE role — on-call rotation, incident response...",
  jobDescriptionFile: null,
  status: "Recruiter Screening",
  resume: { fileName: "litware-resume.pdf", uploadedAt: "2026-03-18T14:00:00Z" },
  coverLetter: null,
  rejection: null,
  interviews: [],
  history: [
    { id: "evt-41", type: "application_created", timestamp: "2026-03-18T14:00:00Z", description: "Application created" },
    { id: "evt-42", type: "status_changed", timestamp: "2026-03-20T09:00:00Z", description: "Status changed to Recruiter Screening" },
  ],
  isDeleted: false,
  deletedAt: null,
  createdAt: "2026-03-18T14:00:00Z",
  updatedAt: "2026-03-20T09:00:00Z",
};

const app5: Application = {
  id: "app-5",
  company: "Adventure Works",
  role: "Cloud Architect",
  location: { city: "Auckland", country: "New Zealand", workMode: "Hybrid", other: null },
  dateApplied: "2026-03-22",
  jobPostingUrl: "https://adventureworks.co.nz/careers",
  jobDescriptionText: "Lead cloud architecture initiatives across Azure and multi-cloud environments. Define standards, mentor teams, and drive cloud-first adoption.",
  jobDescriptionFile: null,
  status: "Application Submitted",
  resume: { fileName: "adventureworks-resume.pdf", uploadedAt: "2026-03-22T10:00:00Z" },
  coverLetter: { fileName: "adventureworks-cl.pdf", uploadedAt: "2026-03-22T10:05:00Z" },
  rejection: null,
  interviews: [],
  history: [
    { id: "evt-51", type: "application_created", timestamp: "2026-03-22T10:00:00Z", description: "Application created" },
    { id: "evt-52", type: "status_changed", timestamp: "2026-03-22T10:00:00Z", description: "Status changed to Application Submitted" },
    { id: "evt-53", type: "file_uploaded", timestamp: "2026-03-22T10:00:00Z", description: "File uploaded: adventureworks-resume.pdf (resume)" },
    { id: "evt-54", type: "file_uploaded", timestamp: "2026-03-22T10:05:00Z", description: "File uploaded: adventureworks-cl.pdf (coverLetter)" },
  ],
  isDeleted: false,
  deletedAt: null,
  createdAt: "2026-03-22T10:00:00Z",
  updatedAt: "2026-03-22T10:05:00Z",
};

const app6: Application = {
  id: "app-6",
  company: "Tailspin Toys",
  role: "Infrastructure Engineer",
  location: { city: "Sydney", country: "Australia", workMode: "Remote", other: null },
  dateApplied: "2026-03-02",
  jobPostingUrl: null,
  jobDescriptionText: null,
  jobDescriptionFile: null,
  status: "Withdrawn",
  resume: null,
  coverLetter: null,
  rejection: { reason: "Withdrew", notes: "Accepted a different offer" },
  interviews: [],
  history: [
    { id: "evt-61", type: "application_created", timestamp: "2026-03-02T08:00:00Z", description: "Application created" },
    { id: "evt-62", type: "status_changed", timestamp: "2026-03-25T12:00:00Z", description: "Status changed to Withdrawn" },
  ],
  isDeleted: false,
  deletedAt: null,
  createdAt: "2026-03-02T08:00:00Z",
  updatedAt: "2026-03-25T12:00:00Z",
};

const app7: Application = {
  id: "app-7",
  company: "Woodgrove Bank",
  role: "Azure DevOps Engineer",
  location: { city: "Sydney", country: "Australia", workMode: "Onsite", other: null },
  dateApplied: "2026-03-28",
  jobPostingUrl: "https://woodgrovebank.com/jobs/devops",
  jobDescriptionText: "Azure DevOps Engineer for our financial services platform...",
  jobDescriptionFile: null,
  status: "Applying",
  resume: null,
  coverLetter: null,
  rejection: null,
  interviews: [],
  history: [
    { id: "evt-71", type: "application_created", timestamp: "2026-03-28T15:00:00Z", description: "Application created" },
  ],
  isDeleted: false,
  deletedAt: null,
  createdAt: "2026-03-28T15:00:00Z",
  updatedAt: "2026-03-28T15:00:00Z",
};

// --- In-Memory Store (persists across requests within the browser session) ---

let nextId = 8;
const db: Map<string, Application> = new Map();
for (const app of [mockApplication, app2, app3, app4, app5, app6, app7]) {
  db.set(app.id, structuredClone(app));
}

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
      history: [
        {
          id: `evt-${Date.now()}`,
          type: "application_created",
          timestamp: now,
          description: "Application created",
        },
      ],
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

  // Upload SAS token — writes uploadedAt immediately so frontend polling succeeds
  http.post(`${API_BASE}/upload/sas-token`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const applicationId = body.applicationId as string | undefined;
    const fileType = body.fileType as string | undefined;
    const fileName = (body.fileName as string | undefined) ?? "upload";
    const container =
      fileType === "resume"
        ? "resumes"
        : fileType === "coverLetter"
          ? "coverletters"
          : "jobdescriptions";
    const timestamp = Date.now();
    const blobPath = `${container}/${applicationId ?? "unknown"}/${timestamp}-${fileName}`;
    const uploadUrl = `https://storage.blob.core.windows.net/${blobPath}?sig=mock`;

    // Simulate processUpload — write file metadata so polling completes immediately
    if (applicationId) {
      const app = findApp(applicationId);
      if (app) {
        const fileMeta = { fileName, uploadedAt: new Date().toISOString() };
        if (fileType === "resume") app.resume = fileMeta;
        else if (fileType === "coverLetter") app.coverLetter = fileMeta;
        else if (fileType === "jobDescriptionFile")
          app.jobDescriptionFile = fileMeta;
        app.updatedAt = fileMeta.uploadedAt;
      }
    }

    return HttpResponse.json({
      data: {
        uploadUrl,
        blobPath,
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

  // Blob Storage direct PUT — simulate successful upload
  http.put("https://storage.blob.core.windows.net/*", () => {
    return new HttpResponse(null, { status: 201 });
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
