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

function buildRequest(
  id: string,
  body: Record<string, unknown> = {},
): HttpRequest {
  return new HttpRequest({
    method: "PATCH",
    url: `http://localhost/api/applications/${id}`,
    params: { id },
    headers: { "Content-Type": "application/json" },
    body: { string: JSON.stringify(body) },
  });
}

function createContext(): InvocationContext {
  return new InvocationContext({ functionName: "updateApplication" });
}

function parseBody(response: { body?: unknown }): Record<string, unknown> {
  return JSON.parse(response.body as string);
}

// A full application document as it would be stored in Cosmos DB
const EXISTING_APPLICATION = {
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
  ],
  isDeleted: false,
  deletedAt: null,
  createdAt: "2026-03-15T10:30:00Z",
  updatedAt: "2026-03-25T16:00:00Z",
};

// Soft-deleted application
const DELETED_APPLICATION = {
  ...EXISTING_APPLICATION,
  id: "del-789",
  isDeleted: true,
  deletedAt: "2026-03-19T09:00:00Z",
};

// Application that already has a rejection reason on record
const REJECTED_APPLICATION = {
  ...EXISTING_APPLICATION,
  id: "rej-456",
  status: "Pending Offer",
  rejection: {
    reason: "Failed Technical",
    notes: "Couldn't solve the system design question",
  },
};

// ---------------------------------------------------------------------------
// Import handler — does NOT exist yet → tests will fail at import time
// ---------------------------------------------------------------------------
import handler from "./index.ts";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("updateApplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authorized owner
    mockRequireOwner.mockReturnValue(null);
    // Default: Cosmos read returns the existing application
    mockRead.mockResolvedValue({ resource: { ...EXISTING_APPLICATION } });
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

      const req = buildRequest("abc-123", { status: "Application Submitted" });
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

      const req = buildRequest("abc-123", { status: "Application Submitted" });
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
    it("should return 200 and update status field only", async () => {
      const req = buildRequest("abc-123", {
        status: "Application Submitted",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const app = body.data as Record<string, unknown>;
      expect(app.id).toBe("abc-123");
      expect(app.status).toBe("Application Submitted");
      // Other fields remain unchanged
      expect(app.company).toBe("Contoso Ltd");
      expect(app.role).toBe("Senior Cloud Engineer");
    });

    it("should return 200 and update multiple fields at once", async () => {
      const req = buildRequest("abc-123", {
        company: "New Corp",
        role: "Lead Engineer",
        jobPostingUrl: "https://newcorp.com/jobs/999",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const app = body.data as Record<string, unknown>;
      expect(app.company).toBe("New Corp");
      expect(app.role).toBe("Lead Engineer");
      expect(app.jobPostingUrl).toBe("https://newcorp.com/jobs/999");
    });

    it("should return 200 and update location (nested object)", async () => {
      const req = buildRequest("abc-123", {
        location: {
          city: "Melbourne",
          country: "Australia",
          workMode: "Remote",
          other: null,
        },
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const app = body.data as Record<string, unknown>;
      const location = app.location as Record<string, unknown>;
      expect(location.city).toBe("Melbourne");
      expect(location.country).toBe("Australia");
      expect(location.workMode).toBe("Remote");
    });

    it("should refresh updatedAt on each update", async () => {
      const req = buildRequest("abc-123", {
        status: "Application Submitted",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;

      // updatedAt must be different from the original value
      expect(app.updatedAt).not.toBe(EXISTING_APPLICATION.updatedAt);
      // updatedAt should be a valid ISO 8601 string
      expect(typeof app.updatedAt).toBe("string");
      const parsed = new Date(app.updatedAt as string);
      expect(parsed.getTime()).not.toBeNaN();
    });

    it("should return response with blobUrl stripped from file fields", async () => {
      const req = buildRequest("abc-123", {
        status: "Application Submitted",
      });
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

      const req = buildRequest("non-existent-id", {
        status: "Application Submitted",
      });
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
      mockRead.mockResolvedValue({ resource: { ...DELETED_APPLICATION } });

      const req = buildRequest("del-789", {
        status: "Application Submitted",
      });
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
  // VALIDATION
  // =========================================================================
  describe("validation", () => {
    it("should return 400 when status is invalid enum", async () => {
      const req = buildRequest("abc-123", { status: "InvalidStatus" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Validation failed",
      });
      const details = (body.error as Record<string, unknown>).details as Array<
        Record<string, unknown>
      >;
      expect(details).toContainEqual(
        expect.objectContaining({ field: "status" }),
      );
    });

    it("should return 400 when company is empty string", async () => {
      const req = buildRequest("abc-123", { company: "" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Validation failed",
      });
      const details = (body.error as Record<string, unknown>).details as Array<
        Record<string, unknown>
      >;
      expect(details).toContainEqual(
        expect.objectContaining({ field: "company" }),
      );
    });

    it("should return 400 when dateApplied is in the future", async () => {
      const req = buildRequest("abc-123", { dateApplied: "2099-12-31" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Validation failed",
      });
      const details = (body.error as Record<string, unknown>).details as Array<
        Record<string, unknown>
      >;
      expect(details).toContainEqual(
        expect.objectContaining({
          field: "dateApplied",
          message: "Cannot be in the future",
        }),
      );
    });
  });

  // =========================================================================
  // BUSINESS RULES
  // =========================================================================
  describe("business rules", () => {
    it("should return 400 when status set to Rejected without rejection.reason", async () => {
      const req = buildRequest("abc-123", { status: "Rejected" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Validation failed",
      });
      const details = (body.error as Record<string, unknown>).details as Array<
        Record<string, unknown>
      >;
      expect(details).toContainEqual(
        expect.objectContaining({
          field: "rejection.reason",
          message: "Required when status is Rejected",
        }),
      );
    });

    it("should accept status Rejected when rejection.reason provided in same request", async () => {
      const req = buildRequest("abc-123", {
        status: "Rejected",
        rejection: {
          reason: "Failed Technical",
          notes: "Couldn't solve the system design question",
        },
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const app = body.data as Record<string, unknown>;
      expect(app.status).toBe("Rejected");
      const rejection = app.rejection as Record<string, unknown>;
      expect(rejection.reason).toBe("Failed Technical");
      expect(rejection.notes).toBe("Couldn't solve the system design question");
    });

    it("should accept status Rejected when rejection.reason already exists on record", async () => {
      // The existing record already has rejection.reason set
      mockRead.mockResolvedValue({
        resource: { ...REJECTED_APPLICATION },
      });

      const req = buildRequest("rej-456", { status: "Rejected" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const app = body.data as Record<string, unknown>;
      expect(app.status).toBe("Rejected");
      // The existing rejection reason should still be on the record
      const rejection = app.rejection as Record<string, unknown>;
      expect(rejection.reason).toBe("Failed Technical");
    });
  });

  // =========================================================================
  // EDGE CASES
  // =========================================================================
  describe("edge cases", () => {
    it("should succeed with empty body and just refresh updatedAt", async () => {
      const req = buildRequest("abc-123", {});
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const app = body.data as Record<string, unknown>;
      expect(app.id).toBe("abc-123");
      // All fields remain unchanged
      expect(app.company).toBe("Contoso Ltd");
      expect(app.role).toBe("Senior Cloud Engineer");
      expect(app.status).toBe("Interview Stage");
      // updatedAt is refreshed
      expect(app.updatedAt).not.toBe(EXISTING_APPLICATION.updatedAt);
    });
  });
});
