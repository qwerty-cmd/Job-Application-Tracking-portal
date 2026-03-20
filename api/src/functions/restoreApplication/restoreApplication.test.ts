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

function buildRequest(id: string): HttpRequest {
  return new HttpRequest({
    method: "PATCH",
    url: `http://localhost/api/applications/${id}/restore`,
    params: { id },
  });
}

function createContext(): InvocationContext {
  return new InvocationContext({ functionName: "restoreApplication" });
}

function parseBody(response: { body?: unknown }): Record<string, unknown> {
  return JSON.parse(response.body as string);
}

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const DELETED_APPLICATION = {
  id: "del-789",
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
      "https://storage.blob.core.windows.net/jobdescriptions/del-789/jd.html",
    fileName: "contoso-jd.html",
    uploadedAt: "2026-03-15T10:30:00Z",
  },
  status: "Interview Stage",
  resume: {
    blobUrl: "https://storage.blob.core.windows.net/resumes/del-789/resume.pdf",
    fileName: "contoso-resume.pdf",
    uploadedAt: "2026-03-15T10:30:00Z",
  },
  coverLetter: {
    blobUrl:
      "https://storage.blob.core.windows.net/coverletters/del-789/cl.pdf",
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
  isDeleted: true,
  deletedAt: "2026-03-19T09:00:00Z",
  createdAt: "2026-03-15T10:30:00Z",
  updatedAt: "2026-03-25T16:00:00Z",
};

const ACTIVE_APPLICATION = {
  id: "abc-123",
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

// ---------------------------------------------------------------------------
// Import handler — does NOT exist yet → tests will fail at import time
// ---------------------------------------------------------------------------
import handler from "./index.ts";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("restoreApplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authorized owner
    mockRequireOwner.mockReturnValue(null);
    // Default: Cosmos read returns the deleted application
    mockRead.mockResolvedValue({ resource: DELETED_APPLICATION });
    // Default: Cosmos replace succeeds and returns the updated doc
    mockReplace.mockImplementation((doc: Record<string, unknown>) =>
      Promise.resolve({ resource: doc }),
    );
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

      const req = buildRequest("del-789");
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

      const req = buildRequest("del-789");
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
    it("should return 200 with full restored application (blobUrl stripped)", async () => {
      const req = buildRequest("del-789");
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const app = body.data as Record<string, unknown>;
      expect(app.id).toBe("del-789");
      expect(app.company).toBe("Contoso Ltd");
      expect(app.role).toBe("Senior Cloud Engineer");
      expect(app.status).toBe("Interview Stage");
      expect(app.isDeleted).toBe(false);
      expect(app.deletedAt).toBeNull();

      // blobUrl should be stripped from file fields
      const resume = app.resume as Record<string, unknown>;
      expect(resume.fileName).toBe("contoso-resume.pdf");
      expect(resume).not.toHaveProperty("blobUrl");

      const coverLetter = app.coverLetter as Record<string, unknown>;
      expect(coverLetter.fileName).toBe("contoso-cl.pdf");
      expect(coverLetter).not.toHaveProperty("blobUrl");

      const jdFile = app.jobDescriptionFile as Record<string, unknown>;
      expect(jdFile.fileName).toBe("contoso-jd.html");
      expect(jdFile).not.toHaveProperty("blobUrl");
    });

    it("should set isDeleted to false and deletedAt to null", async () => {
      const req = buildRequest("del-789");
      await handler(req, createContext());

      expect(mockReplace).toHaveBeenCalledOnce();
      const replacedDoc = mockReplace.mock.calls[0][0];
      expect(replacedDoc.isDeleted).toBe(false);
      expect(replacedDoc.deletedAt).toBeNull();
    });

    it("should call replace on the container with the updated document", async () => {
      const req = buildRequest("del-789");
      await handler(req, createContext());

      expect(mockReplace).toHaveBeenCalledOnce();
      const replacedDoc = mockReplace.mock.calls[0][0];
      // Should preserve existing fields
      expect(replacedDoc.id).toBe("del-789");
      expect(replacedDoc.company).toBe("Contoso Ltd");
      // Should have restored fields
      expect(replacedDoc.isDeleted).toBe(false);
      expect(replacedDoc.deletedAt).toBeNull();
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

    it("should return 404 for application that is NOT soft-deleted", async () => {
      mockRead.mockResolvedValue({ resource: ACTIVE_APPLICATION });

      const req = buildRequest("abc-123");
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({
        code: "NOT_FOUND",
        message: "Application abc-123 not found",
      });
    });
  });
});
