import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpRequest, InvocationContext } from "@azure/functions";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Cosmos DB — provide a mock container with items.query().fetchAll()
const mockFetchAll = vi.fn();
const mockQuery = vi.fn(() => ({ fetchAll: mockFetchAll }));
vi.mock("../../shared/cosmosClient.js", () => ({
  getContainer: vi.fn(() => ({
    items: { query: mockQuery },
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

function buildRequest(): HttpRequest {
  return new HttpRequest({
    method: "GET",
    url: "http://localhost/api/applications/deleted",
  });
}

function createContext(): InvocationContext {
  return new InvocationContext({ functionName: "listDeleted" });
}

function parseBody(response: { body?: unknown }): Record<string, unknown> {
  return JSON.parse(response.body as string);
}

// ---------------------------------------------------------------------------
// Test Fixtures — Cosmos DB documents (soft-deleted)
// ---------------------------------------------------------------------------

const DELETED_APP_1 = {
  id: "del-001",
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
  jobDescriptionText: "We are looking for...",
  jobDescriptionFile: {
    blobUrl:
      "https://storage.blob.core.windows.net/jobdescriptions/del-001/jd.html",
    fileName: "contoso-jd.html",
    uploadedAt: "2026-03-15T10:30:00Z",
  },
  status: "Interview Stage",
  resume: {
    blobUrl: "https://storage.blob.core.windows.net/resumes/del-001/resume.pdf",
    fileName: "contoso-resume.pdf",
    uploadedAt: "2026-03-15T10:30:00Z",
  },
  coverLetter: null,
  rejection: null,
  interviews: [
    {
      id: "int-uuid-1",
      round: 1,
      type: "Phone Screen",
      date: "2026-03-20",
      interviewers: "Jane Smith",
      notes: "Asked about Azure",
      reflection: "Felt confident",
      outcome: "Passed",
      order: 1,
    },
    {
      id: "int-uuid-2",
      round: 2,
      type: "Technical",
      date: "2026-03-25",
      interviewers: "Bob Chen",
      notes: "System design",
      reflection: "Struggled",
      outcome: "Failed",
      order: 2,
    },
  ],
  isDeleted: true,
  deletedAt: "2026-03-19T09:00:00Z",
  createdAt: "2026-03-15T10:30:00Z",
  updatedAt: "2026-03-25T16:00:00Z",
};

const DELETED_APP_2 = {
  id: "del-002",
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
  isDeleted: true,
  deletedAt: "2026-03-18T14:00:00Z",
  createdAt: "2026-03-10T08:00:00Z",
  updatedAt: "2026-03-10T08:00:00Z",
};

// Ordered by deletedAt descending (most recent first)
const ALL_DELETED = [DELETED_APP_1, DELETED_APP_2];

// ---------------------------------------------------------------------------
// Import handler — does NOT exist yet → tests will fail at import time
// ---------------------------------------------------------------------------
import handler from "./index.ts";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("listDeleted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authorized owner
    mockRequireOwner.mockReturnValue(null);
    // Default: Cosmos query returns two deleted apps
    mockFetchAll.mockResolvedValue({ resources: ALL_DELETED });
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

      const req = buildRequest();
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

      const req = buildRequest();
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
    it("should return 200 with items array of soft-deleted application summaries", async () => {
      const req = buildRequest();
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const data = body.data as Record<string, unknown>;
      const items = data.items as Array<Record<string, unknown>>;
      expect(items).toHaveLength(2);

      // Verify summary fields on first item
      const item = items[0];
      expect(item.id).toBe("del-001");
      expect(item.company).toBe("Contoso Ltd");
      expect(item.role).toBe("Senior Cloud Engineer");
      expect(item.status).toBe("Interview Stage");
      expect(item.dateApplied).toBe("2026-03-15");
      expect(item.jobPostingUrl).toBe("https://careers.contoso.com/job/12345");
      expect(item.createdAt).toBe("2026-03-15T10:30:00Z");
      expect(item.updatedAt).toBe("2026-03-25T16:00:00Z");
    });

    it("should include deletedAt field on each item", async () => {
      const req = buildRequest();
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const items = data.items as Array<Record<string, unknown>>;

      expect(items[0].deletedAt).toBe("2026-03-19T09:00:00Z");
      expect(items[1].deletedAt).toBe("2026-03-18T14:00:00Z");
    });

    it("should return summary fields only (hasResume, hasCoverLetter, hasJobDescription, interviewCount — no full details)", async () => {
      const req = buildRequest();
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const items = data.items as Array<Record<string, unknown>>;

      // First item has resume and JD file, no cover letter
      const item1 = items[0];
      expect(item1.hasResume).toBe(true);
      expect(item1.hasCoverLetter).toBe(false);
      expect(item1.hasJobDescription).toBe(true);
      expect(item1.interviewCount).toBe(2);

      // Should NOT include full detail fields
      expect(item1).not.toHaveProperty("resume");
      expect(item1).not.toHaveProperty("coverLetter");
      expect(item1).not.toHaveProperty("jobDescriptionFile");
      expect(item1).not.toHaveProperty("jobDescriptionText");
      expect(item1).not.toHaveProperty("interviews");
      expect(item1).not.toHaveProperty("rejection");

      // Second item has no files and no interviews
      const item2 = items[1];
      expect(item2.hasResume).toBe(false);
      expect(item2.hasCoverLetter).toBe(false);
      expect(item2.hasJobDescription).toBe(false);
      expect(item2.interviewCount).toBe(0);
    });

    it("should return items ordered by deletedAt descending (most recent first)", async () => {
      const req = buildRequest();
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const items = data.items as Array<Record<string, unknown>>;

      // del-001 was deleted on 2026-03-19, del-002 on 2026-03-18
      expect(items[0].id).toBe("del-001");
      expect(items[1].id).toBe("del-002");
      // Verify descending order
      const date0 = new Date(items[0].deletedAt as string).getTime();
      const date1 = new Date(items[1].deletedAt as string).getTime();
      expect(date0).toBeGreaterThan(date1);
    });
  });

  // =========================================================================
  // EDGE CASES
  // =========================================================================
  describe("edge cases", () => {
    it("should return empty items array when no deleted applications exist", async () => {
      mockFetchAll.mockResolvedValue({ resources: [] });

      const req = buildRequest();
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const data = body.data as Record<string, unknown>;
      expect(data.items).toEqual([]);
    });
  });
});
