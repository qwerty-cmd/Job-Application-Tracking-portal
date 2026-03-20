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
    method: "DELETE",
    url: `http://localhost/api/applications/${id}`,
    params: { id },
  });
}

function createContext(): InvocationContext {
  return new InvocationContext({ functionName: "deleteApplication" });
}

function parseBody(response: { body?: unknown }): Record<string, unknown> {
  return JSON.parse(response.body as string);
}

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const ACTIVE_APPLICATION = {
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
  jobDescriptionText: null,
  jobDescriptionFile: null,
  status: "Interview Stage",
  resume: null,
  coverLetter: null,
  rejection: null,
  interviews: [],
  isDeleted: false,
  deletedAt: null,
  createdAt: "2026-03-15T10:30:00Z",
  updatedAt: "2026-03-25T16:00:00Z",
};

const DELETED_APPLICATION = {
  ...ACTIVE_APPLICATION,
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

describe("deleteApplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authorized owner
    mockRequireOwner.mockReturnValue(null);
    // Default: Cosmos read returns the active application
    mockRead.mockResolvedValue({ resource: ACTIVE_APPLICATION });
    // Default: Cosmos replace succeeds
    mockReplace.mockResolvedValue({ resource: {} });
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
    it("should return 200 with { id, deleted: true } on success", async () => {
      const req = buildRequest("abc-123");
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();
      expect(body.data).toMatchObject({ id: "abc-123", deleted: true });
    });

    it("should set isDeleted to true and deletedAt to an ISO timestamp", async () => {
      const req = buildRequest("abc-123");
      await handler(req, createContext());

      // Verify the document passed to replace()
      expect(mockReplace).toHaveBeenCalledOnce();
      const replacedDoc = mockReplace.mock.calls[0][0];
      expect(replacedDoc.isDeleted).toBe(true);
      expect(replacedDoc.deletedAt).toBeDefined();
      // deletedAt should be a valid ISO 8601 string
      expect(new Date(replacedDoc.deletedAt).toISOString()).toBe(
        replacedDoc.deletedAt,
      );
    });

    it("should call replace on the container with the updated document", async () => {
      const req = buildRequest("abc-123");
      await handler(req, createContext());

      expect(mockReplace).toHaveBeenCalledOnce();
      const replacedDoc = mockReplace.mock.calls[0][0];
      // Should preserve existing fields
      expect(replacedDoc.id).toBe("abc-123");
      expect(replacedDoc.company).toBe("Contoso Ltd");
      // Should have updated fields
      expect(replacedDoc.isDeleted).toBe(true);
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

    it("should return 404 for already soft-deleted application", async () => {
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
});
