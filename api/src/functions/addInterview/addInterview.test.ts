import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpRequest, InvocationContext } from "@azure/functions";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Cosmos DB — provide a mock container with item(id, id).read() and .replace()
const mockRead = vi.fn();
const mockReplace = vi.fn();
vi.mock("../../shared/cosmosClient.js", () => ({
  getContainer: vi.fn(() => ({
    item: vi.fn(() => ({ read: mockRead, replace: mockReplace })),
  })),
}));

// Mock auth — default: authorized (owner). Override per-test as needed.
const mockRequireOwner = vi.fn();
vi.mock("../../shared/auth.js", () => ({
  requireOwner: (...args: unknown[]) => mockRequireOwner(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(id: string, body: Record<string, unknown>): HttpRequest {
  return new HttpRequest({
    method: "POST",
    url: `http://localhost/api/applications/${id}/interviews`,
    params: { id },
    headers: { "Content-Type": "application/json" },
    body: { string: JSON.stringify(body) },
  });
}

function createContext(): InvocationContext {
  return new InvocationContext({ functionName: "addInterview" });
}

function parseBody(response: { body?: unknown }): Record<string, unknown> {
  return JSON.parse(response.body as string);
}

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const BASE_APPLICATION = {
  id: "app-001",
  company: "Contoso Ltd",
  role: "Senior Cloud Engineer",
  location: {
    city: "Sydney",
    country: "Australia",
    workMode: "Hybrid",
    other: null,
  },
  dateApplied: "2026-03-15",
  jobPostingUrl: null,
  jobDescriptionText: null,
  jobDescriptionFile: null,
  status: "Applying",
  resume: null,
  coverLetter: null,
  rejection: null,
  interviews: [],
  isDeleted: false,
  deletedAt: null,
  createdAt: "2026-03-15T10:30:00Z",
  updatedAt: "2026-03-15T10:30:00Z",
};

const APP_WITH_FILES = {
  ...BASE_APPLICATION,
  id: "app-files",
  resume: {
    blobUrl:
      "https://storage.blob.core.windows.net/resumes/app-files/resume.pdf",
    fileName: "resume.pdf",
    uploadedAt: "2026-03-15T10:30:00Z",
  },
  coverLetter: {
    blobUrl:
      "https://storage.blob.core.windows.net/coverletters/app-files/cl.pdf",
    fileName: "cl.pdf",
    uploadedAt: "2026-03-15T10:30:05Z",
  },
  jobDescriptionFile: {
    blobUrl:
      "https://storage.blob.core.windows.net/jobdescriptions/app-files/jd.html",
    fileName: "jd.html",
    uploadedAt: "2026-03-15T10:30:00Z",
  },
};

const APP_AT_INTERVIEW_STAGE = {
  ...BASE_APPLICATION,
  id: "app-interview",
  status: "Interview Stage",
  interviews: [
    {
      id: "int-existing-1",
      round: 1,
      type: "Phone Screen",
      date: "2026-03-20",
      interviewers: "Jane Smith",
      notes: "Initial screen",
      reflection: "",
      outcome: "Passed",
      order: 1,
    },
  ],
};

const APP_SUBMITTED = {
  ...BASE_APPLICATION,
  id: "app-submitted",
  status: "Application Submitted",
};

const APP_RECRUITER_SCREENING = {
  ...BASE_APPLICATION,
  id: "app-screening",
  status: "Recruiter Screening",
};

const APP_PENDING_OFFER = {
  ...BASE_APPLICATION,
  id: "app-offer",
  status: "Pending Offer",
  interviews: [
    {
      id: "int-existing-2",
      round: 1,
      type: "Technical",
      date: "2026-03-18",
      interviewers: "Bob Chen",
      notes: "",
      reflection: "",
      outcome: "Passed",
      order: 1,
    },
  ],
};

const DELETED_APPLICATION = {
  ...BASE_APPLICATION,
  id: "app-deleted",
  isDeleted: true,
  deletedAt: "2026-03-19T09:00:00Z",
};

const VALID_INTERVIEW_BODY = {
  type: "Technical",
  date: "2026-03-25",
  interviewers: "Bob Chen, Principal Engineer",
  notes: "System design question",
  reflection: "Need to study caching",
  outcome: "Pending",
};

const MINIMAL_INTERVIEW_BODY = {
  type: "Phone Screen",
  date: "2026-03-20",
  outcome: "Pending",
};

// ---------------------------------------------------------------------------
// Import handler — does NOT exist yet → tests will fail at import time
// ---------------------------------------------------------------------------
import handler from "./index.ts";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("addInterview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authorized owner
    mockRequireOwner.mockReturnValue(null);
    // Default: Cosmos read returns the base application (no interviews)
    mockRead.mockResolvedValue({ resource: { ...BASE_APPLICATION } });
    // Default: Cosmos replace returns the doc it's given
    mockReplace.mockImplementation(async (doc: Record<string, unknown>) => ({
      resource: doc,
    }));
  });

  // =========================================================================
  // AUTH
  // =========================================================================
  describe("auth", () => {
    it("should return 401 when x-ms-client-principal header is missing", async () => {
      mockRequireOwner.mockReturnValue({
        status: 401,
        body: JSON.stringify({
          data: null,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        }),
      });

      const req = buildRequest("app-001", VALID_INTERVIEW_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(401);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("should return 403 when principal is valid but missing owner role", async () => {
      mockRequireOwner.mockReturnValue({
        status: 403,
        body: JSON.stringify({
          data: null,
          error: { code: "FORBIDDEN", message: "Owner role required" },
        }),
      });

      const req = buildRequest("app-001", VALID_INTERVIEW_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(403);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // =========================================================================
  // HAPPY PATH
  // =========================================================================
  describe("happy path", () => {
    it("should return 201 with full application including new interview", async () => {
      const req = buildRequest("app-001", VALID_INTERVIEW_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const app = body.data as Record<string, unknown>;
      expect(app.id).toBe("app-001");

      const interviews = app.interviews as Array<Record<string, unknown>>;
      expect(interviews).toHaveLength(1);

      const interview = interviews[0];
      expect(interview.id).toBeDefined();
      expect(typeof interview.id).toBe("string");
      expect(interview.round).toBe(1);
      expect(interview.order).toBe(1);
      expect(interview.type).toBe("Technical");
      expect(interview.date).toBe("2026-03-25");
      expect(interview.interviewers).toBe("Bob Chen, Principal Engineer");
      expect(interview.notes).toBe("System design question");
      expect(interview.reflection).toBe("Need to study caching");
      expect(interview.outcome).toBe("Pending");
    });

    it("should return 201 with minimal interview fields (no optional text)", async () => {
      const req = buildRequest("app-001", MINIMAL_INTERVIEW_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const app = body.data as Record<string, unknown>;
      const interviews = app.interviews as Array<Record<string, unknown>>;
      expect(interviews).toHaveLength(1);

      const interview = interviews[0];
      expect(interview.type).toBe("Phone Screen");
      expect(interview.date).toBe("2026-03-20");
      expect(interview.outcome).toBe("Pending");
    });

    it("should set round and order to next sequential number when appending to existing interviews", async () => {
      mockRead.mockResolvedValue({ resource: { ...APP_AT_INTERVIEW_STAGE } });

      const req = buildRequest("app-interview", VALID_INTERVIEW_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;
      const interviews = app.interviews as Array<Record<string, unknown>>;
      expect(interviews).toHaveLength(2);

      const newInterview = interviews[1];
      expect(newInterview.round).toBe(2);
      expect(newInterview.order).toBe(2);
    });

    it("should update updatedAt on the parent application", async () => {
      const req = buildRequest("app-001", VALID_INTERVIEW_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;

      // updatedAt should be newer than the original
      const updatedAt = new Date(app.updatedAt as string);
      const original = new Date(BASE_APPLICATION.updatedAt);
      expect(updatedAt.getTime()).toBeGreaterThan(original.getTime());
    });

    it("should call Cosmos replace with the updated document", async () => {
      const req = buildRequest("app-001", VALID_INTERVIEW_BODY);
      await handler(req, createContext());

      expect(mockReplace).toHaveBeenCalledTimes(1);
      const savedDoc = mockReplace.mock.calls[0][0] as Record<string, unknown>;
      const interviews = savedDoc.interviews as Array<Record<string, unknown>>;
      expect(interviews).toHaveLength(1);
      expect(interviews[0].type).toBe("Technical");
    });

    it("should allow future dates for interview date (scheduled ahead)", async () => {
      const req = buildRequest("app-001", {
        ...VALID_INTERVIEW_BODY,
        date: "2027-06-15",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;
      const interviews = app.interviews as Array<Record<string, unknown>>;
      expect(interviews[0].date).toBe("2027-06-15");
    });
  });

  // =========================================================================
  // BUSINESS RULES — STATUS AUTO-UPDATE
  // =========================================================================
  describe("business rules", () => {
    it("should auto-update status to 'Interview Stage' when adding first interview to app with status 'Applying'", async () => {
      mockRead.mockResolvedValue({
        resource: { ...BASE_APPLICATION, status: "Applying" },
      });

      const req = buildRequest("app-001", VALID_INTERVIEW_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;
      expect(app.status).toBe("Interview Stage");
    });

    it("should auto-update status to 'Interview Stage' when adding first interview to app with status 'Application Submitted'", async () => {
      mockRead.mockResolvedValue({ resource: { ...APP_SUBMITTED } });

      const req = buildRequest("app-submitted", VALID_INTERVIEW_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;
      expect(app.status).toBe("Interview Stage");
    });

    it("should auto-update status to 'Interview Stage' when adding first interview to app with status 'Recruiter Screening'", async () => {
      mockRead.mockResolvedValue({ resource: { ...APP_RECRUITER_SCREENING } });

      const req = buildRequest("app-screening", VALID_INTERVIEW_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;
      expect(app.status).toBe("Interview Stage");
    });

    it("should NOT change status when already at 'Interview Stage'", async () => {
      mockRead.mockResolvedValue({ resource: { ...APP_AT_INTERVIEW_STAGE } });

      const req = buildRequest("app-interview", VALID_INTERVIEW_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;
      expect(app.status).toBe("Interview Stage");
    });

    it("should NOT change status when already beyond 'Interview Stage' (e.g. 'Pending Offer')", async () => {
      mockRead.mockResolvedValue({ resource: { ...APP_PENDING_OFFER } });

      const req = buildRequest("app-offer", VALID_INTERVIEW_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;
      expect(app.status).toBe("Pending Offer");
    });
  });

  // =========================================================================
  // RESPONSE SHAPE — BLOB URL STRIPPING
  // =========================================================================
  describe("response shape", () => {
    it("should strip blobUrl from file fields in the response", async () => {
      mockRead.mockResolvedValue({ resource: { ...APP_WITH_FILES } });

      const req = buildRequest("app-files", VALID_INTERVIEW_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;

      const resume = app.resume as Record<string, unknown>;
      expect(resume.fileName).toBe("resume.pdf");
      expect(resume.uploadedAt).toBe("2026-03-15T10:30:00Z");
      expect(resume).not.toHaveProperty("blobUrl");

      const coverLetter = app.coverLetter as Record<string, unknown>;
      expect(coverLetter.fileName).toBe("cl.pdf");
      expect(coverLetter).not.toHaveProperty("blobUrl");

      const jdFile = app.jobDescriptionFile as Record<string, unknown>;
      expect(jdFile.fileName).toBe("jd.html");
      expect(jdFile).not.toHaveProperty("blobUrl");
    });

    it("should have { data, error: null } shape on success", async () => {
      const req = buildRequest("app-001", VALID_INTERVIEW_BODY);
      const res = await handler(req, createContext());

      const body = parseBody(res);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("error");
      expect(body.error).toBeNull();
      expect(body.data).not.toBeNull();
    });
  });

  // =========================================================================
  // VALIDATION
  // =========================================================================
  describe("validation", () => {
    it("should return 400 when type is missing", async () => {
      const req = buildRequest("app-001", {
        date: "2026-03-25",
        outcome: "Pending",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
      const details = error.details as Array<Record<string, unknown>>;
      expect(details.some((d) => d.field === "type")).toBe(true);
    });

    it("should return 400 when type is invalid", async () => {
      const req = buildRequest("app-001", {
        ...VALID_INTERVIEW_BODY,
        type: "GroupDiscussion",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
      const details = error.details as Array<Record<string, unknown>>;
      expect(details.some((d) => d.field === "type")).toBe(true);
    });

    it("should return 400 when date is missing", async () => {
      const req = buildRequest("app-001", {
        type: "Technical",
        outcome: "Pending",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
      const details = error.details as Array<Record<string, unknown>>;
      expect(details.some((d) => d.field === "date")).toBe(true);
    });

    it("should return 400 when date format is invalid", async () => {
      const req = buildRequest("app-001", {
        ...VALID_INTERVIEW_BODY,
        date: "25-03-2026",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
      const details = error.details as Array<Record<string, unknown>>;
      expect(details.some((d) => d.field === "date")).toBe(true);
    });

    it("should return 400 when outcome is missing", async () => {
      const req = buildRequest("app-001", {
        type: "Technical",
        date: "2026-03-25",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
      const details = error.details as Array<Record<string, unknown>>;
      expect(details.some((d) => d.field === "outcome")).toBe(true);
    });

    it("should return 400 when outcome is invalid", async () => {
      const req = buildRequest("app-001", {
        ...VALID_INTERVIEW_BODY,
        outcome: "Maybe",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
      const details = error.details as Array<Record<string, unknown>>;
      expect(details.some((d) => d.field === "outcome")).toBe(true);
    });

    it("should return 400 when interviewers exceeds 500 characters", async () => {
      const req = buildRequest("app-001", {
        ...VALID_INTERVIEW_BODY,
        interviewers: "A".repeat(501),
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
      const details = error.details as Array<Record<string, unknown>>;
      expect(details.some((d) => d.field === "interviewers")).toBe(true);
    });

    it("should return 400 when notes exceeds 10000 characters", async () => {
      const req = buildRequest("app-001", {
        ...VALID_INTERVIEW_BODY,
        notes: "A".repeat(10001),
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
      const details = error.details as Array<Record<string, unknown>>;
      expect(details.some((d) => d.field === "notes")).toBe(true);
    });

    it("should return 400 when reflection exceeds 10000 characters", async () => {
      const req = buildRequest("app-001", {
        ...VALID_INTERVIEW_BODY,
        reflection: "A".repeat(10001),
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
      const details = error.details as Array<Record<string, unknown>>;
      expect(details.some((d) => d.field === "reflection")).toBe(true);
    });

    it("should return 400 with multiple errors when multiple fields are invalid", async () => {
      const req = buildRequest("app-001", {
        type: "InvalidType",
        date: "not-a-date",
        outcome: "Maybe",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
      const details = error.details as Array<Record<string, unknown>>;
      expect(details.length).toBeGreaterThanOrEqual(3);
    });

    it("should return 400 when request body is not valid JSON", async () => {
      const req = new HttpRequest({
        method: "POST",
        url: "http://localhost/api/applications/app-001/interviews",
        params: { id: "app-001" },
        headers: { "Content-Type": "application/json" },
        body: { string: "not valid json{{{" },
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({
        code: "INVALID_BODY",
        message: "Request body must be valid JSON",
      });
    });
  });

  // =========================================================================
  // NOT FOUND
  // =========================================================================
  describe("not found", () => {
    it("should return 404 when application does not exist", async () => {
      mockRead.mockResolvedValue({ resource: undefined });

      const req = buildRequest("nonexistent-id", VALID_INTERVIEW_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });

    it("should return 404 when application is soft-deleted", async () => {
      mockRead.mockResolvedValue({ resource: { ...DELETED_APPLICATION } });

      const req = buildRequest("app-deleted", VALID_INTERVIEW_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
