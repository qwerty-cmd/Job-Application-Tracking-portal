import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpRequest, InvocationContext } from "@azure/functions";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Cosmos DB — provide a mock container with item(id, id).read()
const mockRead = vi.fn();
vi.mock("../../shared/cosmosClient.js", () => ({
  getContainer: vi.fn(() => ({
    item: vi.fn(() => ({ read: mockRead })),
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

function buildRequest(id: string): HttpRequest {
  return new HttpRequest({
    method: "GET",
    url: `http://localhost/api/applications/${id}`,
    params: { id },
  });
}

function createContext(): InvocationContext {
  return new InvocationContext({ functionName: "getApplication" });
}

function parseBody(response: { body?: unknown }): Record<string, unknown> {
  return JSON.parse(response.body as string);
}

// A full application document as it would be stored in Cosmos DB
const FULL_APPLICATION = {
  id: "abc-123",
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
  jobDescriptionText: "We are looking for a Senior Cloud Engineer to...",
  jobDescriptionFile: {
    blobUrl:
      "https://storage.blob.core.windows.net/jobdescriptions/abc-123/jd.html",
    fileName: "contoso-jd.html",
    uploadedAt: "2026-03-15T10:30:00Z",
  },
  status: "Interview Stage",
  resume: {
    blobUrl: "https://storage.blob.core.windows.net/resumes/abc-123/resume.pdf",
    fileName: "contoso-resume.pdf",
    uploadedAt: "2026-03-15T10:30:00Z",
  },
  coverLetter: {
    blobUrl:
      "https://storage.blob.core.windows.net/coverletters/abc-123/cl.pdf",
    fileName: "contoso-cl.pdf",
    uploadedAt: "2026-03-15T10:30:05Z",
  },
  rejection: null,
  interviews: [
    {
      id: "int-uuid-1",
      round: 1,
      type: "Phone Screen",
      date: "2026-03-20",
      interviewers: "Jane Smith, Senior Manager",
      notes: "Asked about Azure experience",
      reflection: "Felt confident",
      outcome: "Passed",
      order: 1,
    },
    {
      id: "int-uuid-2",
      round: 2,
      type: "Technical",
      date: "2026-03-25",
      interviewers: "Bob Chen, Principal Engineer",
      notes: "System design question",
      reflection: "Struggled with caching layer",
      outcome: "Failed",
      order: 2,
    },
  ],
  isDeleted: false,
  deletedAt: null,
  createdAt: "2026-03-15T10:30:00Z",
  updatedAt: "2026-03-25T16:00:00Z",
};

// Minimal application with null optional fields
const MINIMAL_APPLICATION = {
  id: "min-456",
  company: "Acme Inc",
  role: "Software Engineer",
  location: null,
  dateApplied: "2026-03-10",
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
  createdAt: "2026-03-10T08:00:00Z",
  updatedAt: "2026-03-10T08:00:00Z",
};

// Soft-deleted application
const DELETED_APPLICATION = {
  ...FULL_APPLICATION,
  id: "del-789",
  isDeleted: true,
  deletedAt: "2026-03-19T09:00:00Z",
};

// ---------------------------------------------------------------------------
// Import handler — does NOT exist yet → tests will fail at import time
// ---------------------------------------------------------------------------
import handler from "./index.ts";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getApplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authorized owner
    mockRequireOwner.mockReturnValue(null);
    // Default: Cosmos read returns the full application
    mockRead.mockResolvedValue({ resource: FULL_APPLICATION });
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

      const req = buildRequest("abc-123");
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

      const req = buildRequest("abc-123");
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
    it("should return 200 with full application document for existing ID", async () => {
      const req = buildRequest("abc-123");
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const app = body.data as Record<string, unknown>;
      expect(app.id).toBe("abc-123");
      expect(app.company).toBe("Contoso Ltd");
      expect(app.role).toBe("Senior Cloud Engineer");
      expect(app.status).toBe("Interview Stage");
      expect(app.dateApplied).toBe("2026-03-15");
      expect(app.jobPostingUrl).toBe("https://careers.contoso.com/job/12345");
      expect(app.jobDescriptionText).toBe(
        "We are looking for a Senior Cloud Engineer to...",
      );
      expect(app.isDeleted).toBe(false);
      expect(app.deletedAt).toBeNull();
      expect(app.createdAt).toBe("2026-03-15T10:30:00Z");
      expect(app.updatedAt).toBe("2026-03-25T16:00:00Z");
    });

    it("should return file fields with fileName and uploadedAt but NOT blobUrl", async () => {
      const req = buildRequest("abc-123");
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;

      // Resume: has fileName and uploadedAt, no blobUrl
      const resume = app.resume as Record<string, unknown>;
      expect(resume.fileName).toBe("contoso-resume.pdf");
      expect(resume.uploadedAt).toBe("2026-03-15T10:30:00Z");
      expect(resume).not.toHaveProperty("blobUrl");

      // Cover letter: has fileName and uploadedAt, no blobUrl
      const coverLetter = app.coverLetter as Record<string, unknown>;
      expect(coverLetter.fileName).toBe("contoso-cl.pdf");
      expect(coverLetter.uploadedAt).toBe("2026-03-15T10:30:05Z");
      expect(coverLetter).not.toHaveProperty("blobUrl");

      // Job description file: has fileName and uploadedAt, no blobUrl
      const jdFile = app.jobDescriptionFile as Record<string, unknown>;
      expect(jdFile.fileName).toBe("contoso-jd.html");
      expect(jdFile.uploadedAt).toBe("2026-03-15T10:30:00Z");
      expect(jdFile).not.toHaveProperty("blobUrl");
    });
  });

  // =========================================================================
  // NOT FOUND
  // =========================================================================
  describe("not found", () => {
    it("should return 404 for non-existent ID", async () => {
      mockRead.mockResolvedValue({ resource: undefined });

      const req = buildRequest("non-existent-id");
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({
        code: "NOT_FOUND",
        message: "Application non-existent-id not found",
      });
    });

    it("should return 404 for soft-deleted application (isDeleted: true)", async () => {
      mockRead.mockResolvedValue({ resource: DELETED_APPLICATION });

      const req = buildRequest("del-789");
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({
        code: "NOT_FOUND",
        message: "Application del-789 not found",
      });
    });
  });

  // =========================================================================
  // RESPONSE SHAPE
  // =========================================================================
  describe("response shape", () => {
    it("should have { data, error: null } shape on success", async () => {
      const req = buildRequest("abc-123");
      const res = await handler(req, createContext());

      const body = parseBody(res);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("error");
      expect(body.error).toBeNull();
      expect(body.data).not.toBeNull();
    });

    it("should have { data: null, error } shape on 404", async () => {
      mockRead.mockResolvedValue({ resource: undefined });

      const req = buildRequest("missing-id");
      const res = await handler(req, createContext());

      const body = parseBody(res);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("error");
      expect(body.data).toBeNull();
      expect(body.error).not.toBeNull();

      const error = body.error as Record<string, unknown>;
      expect(error).toHaveProperty("code");
      expect(error).toHaveProperty("message");
    });
  });

  // =========================================================================
  // EDGE CASES
  // =========================================================================
  describe("edge cases", () => {
    it("should return application with null optional fields (no files, no rejection, no interviews)", async () => {
      mockRead.mockResolvedValue({ resource: MINIMAL_APPLICATION });

      const req = buildRequest("min-456");
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const app = body.data as Record<string, unknown>;
      expect(app.id).toBe("min-456");
      expect(app.company).toBe("Acme Inc");
      expect(app.location).toBeNull();
      expect(app.jobPostingUrl).toBeNull();
      expect(app.jobDescriptionText).toBeNull();
      expect(app.jobDescriptionFile).toBeNull();
      expect(app.resume).toBeNull();
      expect(app.coverLetter).toBeNull();
      expect(app.rejection).toBeNull();
      expect(app.interviews).toEqual([]);
    });

    it("should return application with full interview array", async () => {
      const req = buildRequest("abc-123");
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;
      const interviews = app.interviews as Array<Record<string, unknown>>;

      expect(interviews).toHaveLength(2);

      expect(interviews[0].id).toBe("int-uuid-1");
      expect(interviews[0].round).toBe(1);
      expect(interviews[0].type).toBe("Phone Screen");
      expect(interviews[0].date).toBe("2026-03-20");
      expect(interviews[0].interviewers).toBe("Jane Smith, Senior Manager");
      expect(interviews[0].notes).toBe("Asked about Azure experience");
      expect(interviews[0].reflection).toBe("Felt confident");
      expect(interviews[0].outcome).toBe("Passed");
      expect(interviews[0].order).toBe(1);

      expect(interviews[1].id).toBe("int-uuid-2");
      expect(interviews[1].round).toBe(2);
      expect(interviews[1].type).toBe("Technical");
      expect(interviews[1].outcome).toBe("Failed");
      expect(interviews[1].order).toBe(2);
    });
  });
});
