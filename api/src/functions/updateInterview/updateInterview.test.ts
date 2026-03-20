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
  interviewId: string,
  body: Record<string, unknown>,
): HttpRequest {
  return new HttpRequest({
    method: "PATCH",
    url: `http://localhost/api/applications/${id}/interviews/${interviewId}`,
    params: { id, interviewId },
    headers: { "Content-Type": "application/json" },
    body: { string: JSON.stringify(body) },
  });
}

function createContext(): InvocationContext {
  return new InvocationContext({ functionName: "updateInterview" });
}

function parseBody(response: { body?: unknown }): Record<string, unknown> {
  return JSON.parse(response.body as string);
}

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const EXISTING_INTERVIEW = {
  id: "int-001",
  round: 1,
  type: "Phone Screen" as const,
  date: "2026-03-20",
  interviewers: "Jane Smith, Senior Manager",
  notes: "Asked about Azure experience",
  reflection: "Felt confident",
  outcome: "Passed" as const,
  order: 1,
};

const SECOND_INTERVIEW = {
  id: "int-002",
  round: 2,
  type: "Technical" as const,
  date: "2026-03-25",
  interviewers: "Bob Chen",
  notes: "System design",
  reflection: "",
  outcome: "Pending" as const,
  order: 2,
};

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
  status: "Interview Stage",
  resume: null,
  coverLetter: null,
  rejection: null,
  interviews: [EXISTING_INTERVIEW, SECOND_INTERVIEW],
  isDeleted: false,
  deletedAt: null,
  createdAt: "2026-03-15T10:30:00Z",
  updatedAt: "2026-03-15T10:30:00Z",
};

const APP_WITH_FILES = {
  ...BASE_APPLICATION,
  resume: {
    blobUrl: "https://storage.blob.core.windows.net/resumes/app-001/resume.pdf",
    fileName: "resume.pdf",
    uploadedAt: "2026-03-15T10:30:00Z",
  },
  coverLetter: {
    blobUrl:
      "https://storage.blob.core.windows.net/coverletters/app-001/cl.pdf",
    fileName: "cl.pdf",
    uploadedAt: "2026-03-15T10:30:05Z",
  },
  jobDescriptionFile: {
    blobUrl:
      "https://storage.blob.core.windows.net/jobdescriptions/app-001/jd.html",
    fileName: "jd.html",
    uploadedAt: "2026-03-15T10:30:00Z",
  },
};

const DELETED_APPLICATION = {
  ...BASE_APPLICATION,
  id: "app-deleted",
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

describe("updateInterview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authorized owner
    mockRequireOwner.mockReturnValue(null);
    // Default: Cosmos read returns the application with existing interviews
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

      const req = buildRequest("app-001", "int-001", { outcome: "Failed" });
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

      const req = buildRequest("app-001", "int-001", { outcome: "Failed" });
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
    it("should return 200 and update only the outcome field", async () => {
      const req = buildRequest("app-001", "int-001", { outcome: "Failed" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const app = body.data as Record<string, unknown>;
      const interviews = app.interviews as Array<Record<string, unknown>>;
      const updated = interviews.find((i) => i.id === "int-001");
      expect(updated).toBeDefined();
      expect(updated!.outcome).toBe("Failed");
      // Other fields remain unchanged
      expect(updated!.type).toBe("Phone Screen");
      expect(updated!.interviewers).toBe("Jane Smith, Senior Manager");
    });

    it("should return 200 and update multiple fields at once", async () => {
      const req = buildRequest("app-001", "int-001", {
        outcome: "Failed",
        reflection: "Should have prepared more",
        notes: "Updated notes after reflection",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const app = body.data as Record<string, unknown>;
      const interviews = app.interviews as Array<Record<string, unknown>>;
      const updated = interviews.find((i) => i.id === "int-001");
      expect(updated!.outcome).toBe("Failed");
      expect(updated!.reflection).toBe("Should have prepared more");
      expect(updated!.notes).toBe("Updated notes after reflection");
    });

    it("should update updatedAt on the parent application", async () => {
      const req = buildRequest("app-001", "int-001", { outcome: "Failed" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;

      const updatedAt = new Date(app.updatedAt as string);
      const original = new Date(BASE_APPLICATION.updatedAt);
      expect(updatedAt.getTime()).toBeGreaterThan(original.getTime());
    });

    it("should not modify other interviews in the array", async () => {
      const req = buildRequest("app-001", "int-001", { outcome: "Failed" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;
      const interviews = app.interviews as Array<Record<string, unknown>>;

      const untouched = interviews.find((i) => i.id === "int-002");
      expect(untouched).toBeDefined();
      expect(untouched!.outcome).toBe("Pending");
      expect(untouched!.type).toBe("Technical");
    });

    it("should call Cosmos replace with the updated document", async () => {
      const req = buildRequest("app-001", "int-001", { outcome: "Failed" });
      await handler(req, createContext());

      expect(mockReplace).toHaveBeenCalledTimes(1);
      const savedDoc = mockReplace.mock.calls[0][0] as Record<string, unknown>;
      const interviews = savedDoc.interviews as Array<Record<string, unknown>>;
      const updated = interviews.find((i) => i.id === "int-001");
      expect(updated!.outcome).toBe("Failed");
    });
  });

  // =========================================================================
  // RESPONSE SHAPE — BLOB URL STRIPPING
  // =========================================================================
  describe("response shape", () => {
    it("should strip blobUrl from file fields in the response", async () => {
      mockRead.mockResolvedValue({ resource: { ...APP_WITH_FILES } });

      const req = buildRequest("app-001", "int-001", { outcome: "Failed" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;

      const resume = app.resume as Record<string, unknown>;
      expect(resume.fileName).toBe("resume.pdf");
      expect(resume).not.toHaveProperty("blobUrl");

      const coverLetter = app.coverLetter as Record<string, unknown>;
      expect(coverLetter.fileName).toBe("cl.pdf");
      expect(coverLetter).not.toHaveProperty("blobUrl");

      const jdFile = app.jobDescriptionFile as Record<string, unknown>;
      expect(jdFile.fileName).toBe("jd.html");
      expect(jdFile).not.toHaveProperty("blobUrl");
    });

    it("should have { data, error: null } shape on success", async () => {
      const req = buildRequest("app-001", "int-001", { outcome: "Failed" });
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
    it("should return 400 when outcome is invalid", async () => {
      const req = buildRequest("app-001", "int-001", { outcome: "Maybe" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
      const details = error.details as Array<Record<string, unknown>>;
      expect(details.some((d) => d.field === "outcome")).toBe(true);
    });

    it("should return 400 when type is invalid", async () => {
      const req = buildRequest("app-001", "int-001", {
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

    it("should return 400 when date format is invalid", async () => {
      const req = buildRequest("app-001", "int-001", { date: "25-03-2026" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
      const details = error.details as Array<Record<string, unknown>>;
      expect(details.some((d) => d.field === "date")).toBe(true);
    });

    it("should return 400 when interviewers exceeds 500 characters", async () => {
      const req = buildRequest("app-001", "int-001", {
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
      const req = buildRequest("app-001", "int-001", {
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
      const req = buildRequest("app-001", "int-001", {
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
  });

  // =========================================================================
  // NOT FOUND
  // =========================================================================
  describe("not found", () => {
    it("should return 404 when application does not exist", async () => {
      mockRead.mockResolvedValue({ resource: undefined });

      const req = buildRequest("nonexistent", "int-001", { outcome: "Failed" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });

    it("should return 404 when application is soft-deleted", async () => {
      mockRead.mockResolvedValue({ resource: { ...DELETED_APPLICATION } });

      const req = buildRequest("app-deleted", "int-001", { outcome: "Failed" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });

    it("should return 404 when interview ID does not exist on the application", async () => {
      const req = buildRequest("app-001", "nonexistent-int", {
        outcome: "Failed",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
