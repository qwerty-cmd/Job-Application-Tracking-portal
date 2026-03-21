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
    method: "PATCH",
    url: `http://localhost/api/applications/${id}/interviews/reorder`,
    params: { id },
    headers: { "Content-Type": "application/json" },
    body: { string: JSON.stringify(body) },
  });
}

function createContext(): InvocationContext {
  return new InvocationContext({ functionName: "reorderInterviews" });
}

function parseBody(response: { body?: unknown }): Record<string, unknown> {
  return JSON.parse(response.body as string);
}

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const INTERVIEW_1 = {
  id: "int-001",
  round: 1,
  type: "Phone Screen" as const,
  date: "2026-03-20",
  interviewers: "Jane Smith",
  notes: "Initial screen",
  reflection: "",
  outcome: "Passed" as const,
  order: 1,
};

const INTERVIEW_2 = {
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

const INTERVIEW_3 = {
  id: "int-003",
  round: 3,
  type: "Behavioral" as const,
  date: "2026-03-28",
  interviewers: "Carol White",
  notes: "",
  reflection: "",
  outcome: "Pending" as const,
  order: 3,
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
  interviews: [INTERVIEW_1, INTERVIEW_2, INTERVIEW_3],
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

describe("reorderInterviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authorized owner
    mockRequireOwner.mockReturnValue(null);
    // Default: Cosmos read returns the application with 3 interviews
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

      const req = buildRequest("app-001", {
        order: ["int-002", "int-001", "int-003"],
      });
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

      const req = buildRequest("app-001", {
        order: ["int-002", "int-001", "int-003"],
      });
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
    it("should return 200 and reorder interviews by updating order fields", async () => {
      const req = buildRequest("app-001", {
        order: ["int-003", "int-001", "int-002"],
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const app = body.data as Record<string, unknown>;
      const interviews = app.interviews as Array<Record<string, unknown>>;
      expect(interviews).toHaveLength(3);

      // int-003 should have order 1, int-001 order 2, int-002 order 3
      const int003 = interviews.find((i) => i.id === "int-003");
      const int001 = interviews.find((i) => i.id === "int-001");
      const int002 = interviews.find((i) => i.id === "int-002");
      expect(int003!.order).toBe(1);
      expect(int001!.order).toBe(2);
      expect(int002!.order).toBe(3);
    });

    it("should preserve same order when IDs are in existing order", async () => {
      const req = buildRequest("app-001", {
        order: ["int-001", "int-002", "int-003"],
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;
      const interviews = app.interviews as Array<Record<string, unknown>>;

      const int001 = interviews.find((i) => i.id === "int-001");
      const int002 = interviews.find((i) => i.id === "int-002");
      const int003 = interviews.find((i) => i.id === "int-003");
      expect(int001!.order).toBe(1);
      expect(int002!.order).toBe(2);
      expect(int003!.order).toBe(3);
    });

    it("should update updatedAt on the parent application", async () => {
      const req = buildRequest("app-001", {
        order: ["int-002", "int-001", "int-003"],
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;

      const updatedAt = new Date(app.updatedAt as string);
      const original = new Date(BASE_APPLICATION.updatedAt);
      expect(updatedAt.getTime()).toBeGreaterThan(original.getTime());
    });

    it("should call Cosmos replace with the reordered document", async () => {
      const req = buildRequest("app-001", {
        order: ["int-003", "int-001", "int-002"],
      });
      await handler(req, createContext());

      expect(mockReplace).toHaveBeenCalledTimes(1);
      const savedDoc = mockReplace.mock.calls[0][0] as Record<string, unknown>;
      const interviews = savedDoc.interviews as Array<Record<string, unknown>>;
      const int003 = interviews.find((i) => i.id === "int-003");
      expect(int003!.order).toBe(1);
    });

    it("should not change round numbers (only order)", async () => {
      const req = buildRequest("app-001", {
        order: ["int-003", "int-001", "int-002"],
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;
      const interviews = app.interviews as Array<Record<string, unknown>>;

      // round numbers stay the same — they are the original sequence
      const int001 = interviews.find((i) => i.id === "int-001");
      const int002 = interviews.find((i) => i.id === "int-002");
      const int003 = interviews.find((i) => i.id === "int-003");
      expect(int001!.round).toBe(1);
      expect(int002!.round).toBe(2);
      expect(int003!.round).toBe(3);
    });
  });

  // =========================================================================
  // RESPONSE SHAPE — BLOB URL STRIPPING
  // =========================================================================
  describe("response shape", () => {
    it("should strip blobUrl from file fields in the response", async () => {
      mockRead.mockResolvedValue({ resource: { ...APP_WITH_FILES } });

      const req = buildRequest("app-001", {
        order: ["int-001", "int-002", "int-003"],
      });
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
      const req = buildRequest("app-001", {
        order: ["int-001", "int-002", "int-003"],
      });
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
    it("should return 400 when order array is missing", async () => {
      const req = buildRequest("app-001", {});
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when order array is not an array", async () => {
      const req = buildRequest("app-001", { order: "int-001" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when order array is missing IDs (partial reorder)", async () => {
      const req = buildRequest("app-001", {
        order: ["int-001", "int-002"],
        // Missing int-003
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when order array has extra IDs", async () => {
      const req = buildRequest("app-001", {
        order: ["int-001", "int-002", "int-003", "int-004"],
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when order array contains non-existent IDs", async () => {
      const req = buildRequest("app-001", {
        order: ["int-001", "int-002", "nonexistent"],
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when order array contains duplicate IDs", async () => {
      const req = buildRequest("app-001", {
        order: ["int-001", "int-001", "int-003"],
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when order array is empty", async () => {
      const req = buildRequest("app-001", { order: [] });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when request body is not valid JSON", async () => {
      const req = new HttpRequest({
        method: "PATCH",
        url: "http://localhost/api/applications/app-001/interviews/reorder",
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

      const req = buildRequest("nonexistent", {
        order: ["int-001", "int-002", "int-003"],
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });

    it("should return 404 when application is soft-deleted", async () => {
      mockRead.mockResolvedValue({ resource: { ...DELETED_APPLICATION } });

      const req = buildRequest("app-deleted", {
        order: ["int-001", "int-002", "int-003"],
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
