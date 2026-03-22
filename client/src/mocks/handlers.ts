import { http, HttpResponse } from "msw";
import type {
  Application,
  ApplicationListResponse,
  ApplicationSummary,
  StatsResponse,
} from "@/types";

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

export const mockSummary: ApplicationSummary = {
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
  status: "Interview Stage",
  jobPostingUrl: "https://careers.contoso.com/job/12345",
  hasResume: true,
  hasCoverLetter: true,
  hasJobDescription: false,
  interviewCount: 1,
  createdAt: "2026-03-15T10:30:00Z",
  updatedAt: "2026-03-25T16:00:00Z",
};

const mockStats: StatsResponse = {
  period: { from: "2026-03-01", to: "2026-03-18" },
  totalApplications: 5,
  byStatus: {
    Applying: 1,
    "Application Submitted": 1,
    "Recruiter Screening": 1,
    "Interview Stage": 1,
    "Pending Offer": 0,
    Accepted: 0,
    Rejected: 1,
    Withdrawn: 0,
  },
  totalInterviews: 2,
  interviewsByType: {
    "Phone Screen": 1,
    Technical: 1,
    Behavioral: 0,
    "Case Study": 0,
    Panel: 0,
    "Take Home Test": 0,
    Other: 0,
  },
};

// --- Handlers ---

export const handlers = [
  // List applications
  http.get(`${API_BASE}/applications`, () => {
    const response: ApplicationListResponse = {
      items: [mockSummary],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    };
    return HttpResponse.json({ data: response, error: null });
  }),

  // Stats — MUST be before :id to avoid parameterized match
  http.get(`${API_BASE}/applications/stats`, () => {
    return HttpResponse.json({ data: mockStats, error: null });
  }),

  // Deleted list — MUST be before :id to avoid parameterized match
  http.get(`${API_BASE}/applications/deleted`, () => {
    return HttpResponse.json({ data: { items: [] }, error: null });
  }),

  // Get single application
  http.get(`${API_BASE}/applications/:id`, ({ params }) => {
    if (params.id === mockApplication.id) {
      return HttpResponse.json({ data: mockApplication, error: null });
    }
    return HttpResponse.json(
      {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: `Application ${params.id} not found`,
        },
      },
      { status: 404 },
    );
  }),

  // Create application
  http.post(`${API_BASE}/applications`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const created: Application = {
      ...mockApplication,
      id: "app-new",
      company: (body.company as string) ?? "New Company",
      role: (body.role as string) ?? "New Role",
      status: "Applying",
      interviews: [],
      resume: null,
      coverLetter: null,
      rejection: null,
      jobDescriptionFile: null,
      jobDescriptionText: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return HttpResponse.json({ data: created, error: null }, { status: 201 });
  }),

  // Update application
  http.patch(`${API_BASE}/applications/:id`, async ({ params, request }) => {
    if (params.id !== mockApplication.id) {
      return HttpResponse.json(
        {
          data: null,
          error: {
            code: "NOT_FOUND",
            message: `Application ${params.id} not found`,
          },
        },
        { status: 404 },
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      data: {
        ...mockApplication,
        ...body,
        updatedAt: new Date().toISOString(),
      },
      error: null,
    });
  }),

  // Delete application (soft)
  http.delete(`${API_BASE}/applications/:id`, ({ params }) => {
    if (params.id !== mockApplication.id) {
      return HttpResponse.json(
        {
          data: null,
          error: {
            code: "NOT_FOUND",
            message: `Application ${params.id} not found`,
          },
        },
        { status: 404 },
      );
    }
    return HttpResponse.json({
      data: { id: params.id, deleted: true },
      error: null,
    });
  }),

  // Restore application
  http.patch(`${API_BASE}/applications/:id/restore`, ({ params }) => {
    if (params.id !== mockApplication.id) {
      return HttpResponse.json(
        {
          data: null,
          error: {
            code: "NOT_FOUND",
            message: `Application ${params.id} not found`,
          },
        },
        { status: 404 },
      );
    }
    return HttpResponse.json({
      data: { ...mockApplication, isDeleted: false, deletedAt: null },
      error: null,
    });
  }),

  // Add interview
  http.post(
    `${API_BASE}/applications/:id/interviews`,
    async ({ params, request }) => {
      if (params.id !== mockApplication.id) {
        return HttpResponse.json(
          {
            data: null,
            error: {
              code: "NOT_FOUND",
              message: `Application ${params.id} not found`,
            },
          },
          { status: 404 },
        );
      }
      const body = (await request.json()) as Record<string, unknown>;
      const newInterview = {
        id: "int-new",
        round: mockApplication.interviews.length + 1,
        order: mockApplication.interviews.length + 1,
        ...body,
      };
      return HttpResponse.json(
        {
          data: {
            ...mockApplication,
            interviews: [...mockApplication.interviews, newInterview],
            updatedAt: new Date().toISOString(),
          },
          error: null,
        },
        { status: 201 },
      );
    },
  ),

  // Update interview
  http.patch(
    `${API_BASE}/applications/:id/interviews/:interviewId`,
    async ({ params, request }) => {
      if (params.id !== mockApplication.id) {
        return HttpResponse.json(
          {
            data: null,
            error: {
              code: "NOT_FOUND",
              message: `Application ${params.id} not found`,
            },
          },
          { status: 404 },
        );
      }
      const body = (await request.json()) as Record<string, unknown>;
      const updated = mockApplication.interviews.map((i) =>
        i.id === params.interviewId ? { ...i, ...body } : i,
      );
      return HttpResponse.json({
        data: {
          ...mockApplication,
          interviews: updated,
          updatedAt: new Date().toISOString(),
        },
        error: null,
      });
    },
  ),

  // Delete interview
  http.delete(
    `${API_BASE}/applications/:id/interviews/:interviewId`,
    ({ params }) => {
      if (params.id !== mockApplication.id) {
        return HttpResponse.json(
          {
            data: null,
            error: {
              code: "NOT_FOUND",
              message: `Application ${params.id} not found`,
            },
          },
          { status: 404 },
        );
      }
      const remaining = mockApplication.interviews.filter(
        (i) => i.id !== params.interviewId,
      );
      return HttpResponse.json({
        data: {
          ...mockApplication,
          interviews: remaining,
          updatedAt: new Date().toISOString(),
        },
        error: null,
      });
    },
  ),

  // Reorder interviews
  http.patch(
    `${API_BASE}/applications/:id/interviews/reorder`,
    async ({ params, request }) => {
      if (params.id !== mockApplication.id) {
        return HttpResponse.json(
          {
            data: null,
            error: {
              code: "NOT_FOUND",
              message: `Application ${params.id} not found`,
            },
          },
          { status: 404 },
        );
      }
      const body = (await request.json()) as { order: string[] };
      const reordered = body.order
        .map((id, idx) => {
          const found = mockApplication.interviews.find((i) => i.id === id);
          return found ? { ...found, order: idx + 1 } : found;
        })
        .filter(Boolean);
      return HttpResponse.json({
        data: {
          ...mockApplication,
          interviews: reordered,
          updatedAt: new Date().toISOString(),
        },
        error: null,
      });
    },
  ),

  // Delete file
  http.delete(`${API_BASE}/applications/:id/files/:fileType`, ({ params }) => {
    if (params.id !== mockApplication.id) {
      return HttpResponse.json(
        {
          data: null,
          error: {
            code: "NOT_FOUND",
            message: `Application ${params.id} not found`,
          },
        },
        { status: 404 },
      );
    }
    return HttpResponse.json({
      data: {
        id: params.id,
        fileType: params.fileType,
        deleted: true,
      },
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
