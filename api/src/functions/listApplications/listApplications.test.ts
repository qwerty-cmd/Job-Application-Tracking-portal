import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpRequest, InvocationContext } from "@azure/functions";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Cosmos DB — provide a mock container with items.query().fetchAll()
const mockFetchAll = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockQuery = vi.fn((_querySpec: any) => ({ fetchAll: mockFetchAll }));
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

function buildRequest(queryParams?: Record<string, string>): HttpRequest {
  const url = new URL("http://localhost/api/applications");
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }
  }
  return new HttpRequest({
    method: "GET",
    url: url.toString(),
  });
}

function createContext(): InvocationContext {
  return new InvocationContext({ functionName: "listApplications" });
}

function parseBody(response: { body?: unknown }): Record<string, unknown> {
  return JSON.parse(response.body as string);
}

// ---------------------------------------------------------------------------
// Test Fixtures — full Cosmos DB documents (as stored)
// ---------------------------------------------------------------------------

const APP_WITH_FILES = {
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
  isDeleted: false,
  deletedAt: null,
  createdAt: "2026-03-15T10:30:00Z",
  updatedAt: "2026-03-25T16:00:00Z",
};

const APP_MINIMAL = {
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

const APP_SUBMITTED = {
  id: "sub-789",
  company: "Globex Corp",
  role: "Product Manager",
  location: {
    city: "Melbourne",
    country: "Australia",
    workMode: "Remote",
    other: null,
  },
  dateApplied: "2026-03-12",
  jobPostingUrl: null,
  jobDescriptionText: null,
  jobDescriptionFile: null,
  status: "Application Submitted",
  resume: {
    blobUrl: "https://storage.blob.core.windows.net/resumes/sub-789/resume.pdf",
    fileName: "resume.pdf",
    uploadedAt: "2026-03-12T09:00:00Z",
  },
  coverLetter: null,
  rejection: null,
  interviews: [],
  isDeleted: false,
  deletedAt: null,
  createdAt: "2026-03-12T09:00:00Z",
  updatedAt: "2026-03-12T09:00:00Z",
};

const ALL_APPS = [APP_WITH_FILES, APP_MINIMAL, APP_SUBMITTED];

// ---------------------------------------------------------------------------
// Import handler — does NOT exist yet → tests will fail at import time
// ---------------------------------------------------------------------------
import handler from "./index.ts";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("listApplications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authorized owner
    mockRequireOwner.mockReturnValue(null);
    // Default: Cosmos query returns all three apps
    mockFetchAll.mockResolvedValue({ resources: ALL_APPS });
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
    it("should return 200 with items and pagination for default query", async () => {
      const req = buildRequest();
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const data = body.data as Record<string, unknown>;
      expect(data).toHaveProperty("items");
      expect(data).toHaveProperty("pagination");

      const items = data.items as unknown[];
      expect(items).toHaveLength(3);

      const pagination = data.pagination as Record<string, unknown>;
      expect(pagination.page).toBe(1);
      expect(pagination.pageSize).toBe(20);
      expect(pagination.totalItems).toBe(3);
      expect(pagination.totalPages).toBe(1);
    });

    it("should return summary fields only — no interviews array, no jobDescriptionText, no blobUrl", async () => {
      mockFetchAll.mockResolvedValue({ resources: [APP_WITH_FILES] });

      const req = buildRequest();
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const items = data.items as Array<Record<string, unknown>>;
      const item = items[0];

      // Summary fields present
      expect(item.id).toBe("abc-123");
      expect(item.company).toBe("Contoso Ltd");
      expect(item.role).toBe("Senior Cloud Engineer");
      expect(item.location).toEqual({
        city: "Sydney",
        country: "Australia",
        workMode: "Hybrid",
        other: null,
      });
      expect(item.dateApplied).toBe("2026-03-15");
      expect(item.status).toBe("Interview Stage");
      expect(item.jobPostingUrl).toBe("https://careers.contoso.com/job/12345");
      expect(item.createdAt).toBe("2026-03-15T10:30:00Z");
      expect(item.updatedAt).toBe("2026-03-25T16:00:00Z");

      // Fields that must NOT be in summary
      expect(item).not.toHaveProperty("interviews");
      expect(item).not.toHaveProperty("jobDescriptionText");
      expect(item).not.toHaveProperty("jobDescriptionFile");
      expect(item).not.toHaveProperty("resume");
      expect(item).not.toHaveProperty("coverLetter");
      expect(item).not.toHaveProperty("rejection");
      expect(item).not.toHaveProperty("isDeleted");
      expect(item).not.toHaveProperty("deletedAt");
    });

    it("should correctly derive hasResume, hasCoverLetter, hasJobDescription from null checks", async () => {
      // APP_WITH_FILES has all three files
      // APP_MINIMAL has none
      // APP_SUBMITTED has resume only
      mockFetchAll.mockResolvedValue({
        resources: [APP_WITH_FILES, APP_MINIMAL, APP_SUBMITTED],
      });

      const req = buildRequest();
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const items = data.items as Array<Record<string, unknown>>;

      // APP_WITH_FILES — all files present
      const withFiles = items.find((i) => i.id === "abc-123");
      expect(withFiles!.hasResume).toBe(true);
      expect(withFiles!.hasCoverLetter).toBe(true);
      expect(withFiles!.hasJobDescription).toBe(true);

      // APP_MINIMAL — no files
      const minimal = items.find((i) => i.id === "min-456");
      expect(minimal!.hasResume).toBe(false);
      expect(minimal!.hasCoverLetter).toBe(false);
      expect(minimal!.hasJobDescription).toBe(false);

      // APP_SUBMITTED — resume only
      const submitted = items.find((i) => i.id === "sub-789");
      expect(submitted!.hasResume).toBe(true);
      expect(submitted!.hasCoverLetter).toBe(false);
      expect(submitted!.hasJobDescription).toBe(false);
    });

    it("should correctly derive interviewCount from interviews array length", async () => {
      mockFetchAll.mockResolvedValue({
        resources: [APP_WITH_FILES, APP_MINIMAL],
      });

      const req = buildRequest();
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const items = data.items as Array<Record<string, unknown>>;

      // APP_WITH_FILES has 2 interviews
      const withInterviews = items.find((i) => i.id === "abc-123");
      expect(withInterviews!.interviewCount).toBe(2);

      // APP_MINIMAL has 0 interviews
      const noInterviews = items.find((i) => i.id === "min-456");
      expect(noInterviews!.interviewCount).toBe(0);
    });
  });

  // =========================================================================
  // FILTERING
  // =========================================================================
  describe("filtering", () => {
    it("should pass status filter to the Cosmos query", async () => {
      mockFetchAll.mockResolvedValue({ resources: [APP_WITH_FILES] });

      const req = buildRequest({ status: "Interview Stage" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);

      // Verify the query was called with a querySpec that includes the status filter
      expect(mockQuery).toHaveBeenCalled();
      const querySpec = mockQuery.mock.calls[0][0];
      // The query string should contain a status condition
      expect(querySpec.query).toContain("status");
      // The parameters should include the status value
      const params = querySpec.parameters as Array<{
        name: string;
        value: string;
      }>;
      const statusParam = params.find((p) => p.value === "Interview Stage");
      expect(statusParam).toBeDefined();
    });

    it("should pass from/to date range filter to the Cosmos query", async () => {
      mockFetchAll.mockResolvedValue({ resources: [APP_WITH_FILES] });

      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);

      expect(mockQuery).toHaveBeenCalled();
      const querySpec = mockQuery.mock.calls[0][0];
      // The query string should contain date range conditions
      expect(querySpec.query).toContain("dateApplied");
      const params = querySpec.parameters as Array<{
        name: string;
        value: string;
      }>;
      const fromParam = params.find((p) => p.value === "2026-03-01");
      const toParam = params.find((p) => p.value === "2026-03-18");
      expect(fromParam).toBeDefined();
      expect(toParam).toBeDefined();
    });
  });

  // =========================================================================
  // SORTING
  // =========================================================================
  describe("sorting", () => {
    it("should apply sortBy and sortOrder to the Cosmos query", async () => {
      mockFetchAll.mockResolvedValue({
        resources: [APP_MINIMAL, APP_WITH_FILES],
      });

      const req = buildRequest({ sortBy: "company", sortOrder: "asc" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);

      expect(mockQuery).toHaveBeenCalled();
      const querySpec = mockQuery.mock.calls[0][0];
      // The query should contain ORDER BY with the specified column and direction
      expect(querySpec.query).toContain("ORDER BY");
      expect(querySpec.query).toContain("company");
      expect(querySpec.query.toUpperCase()).toContain("ASC");
    });

    it("should default to sortBy=dateApplied and sortOrder=desc", async () => {
      mockFetchAll.mockResolvedValue({ resources: ALL_APPS });

      const req = buildRequest();
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);

      expect(mockQuery).toHaveBeenCalled();
      const querySpec = mockQuery.mock.calls[0][0];
      expect(querySpec.query).toContain("ORDER BY");
      expect(querySpec.query).toContain("dateApplied");
      expect(querySpec.query.toUpperCase()).toContain("DESC");
    });
  });

  // =========================================================================
  // PAGINATION
  // =========================================================================
  describe("pagination", () => {
    it("should default to page=1 and pageSize=20", async () => {
      mockFetchAll.mockResolvedValue({ resources: ALL_APPS });

      const req = buildRequest();
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const pagination = data.pagination as Record<string, unknown>;

      expect(pagination.page).toBe(1);
      expect(pagination.pageSize).toBe(20);
    });

    it("should respect custom page and pageSize", async () => {
      // Return enough items to occupy multiple pages
      const manyApps = Array.from({ length: 15 }, (_, i) => ({
        ...APP_MINIMAL,
        id: `app-${i}`,
      }));
      mockFetchAll.mockResolvedValue({ resources: manyApps });

      const req = buildRequest({ page: "2", pageSize: "5" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const pagination = data.pagination as Record<string, unknown>;
      const items = data.items as unknown[];

      expect(pagination.page).toBe(2);
      expect(pagination.pageSize).toBe(5);
      expect(pagination.totalItems).toBe(15);
      expect(pagination.totalPages).toBe(3);
      // Page 2 with pageSize 5 should return items 5-9
      expect(items).toHaveLength(5);
    });

    it("should cap pageSize at 100", async () => {
      mockFetchAll.mockResolvedValue({ resources: ALL_APPS });

      const req = buildRequest({ pageSize: "500" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const pagination = data.pagination as Record<string, unknown>;

      // pageSize should be capped at 100, not 500
      expect(pagination.pageSize).toBe(100);
    });
  });

  // =========================================================================
  // EDGE CASES
  // =========================================================================
  describe("edge cases", () => {
    it("should return empty items array with correct pagination when no results", async () => {
      mockFetchAll.mockResolvedValue({ resources: [] });

      const req = buildRequest();
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const data = body.data as Record<string, unknown>;
      const items = data.items as unknown[];
      expect(items).toEqual([]);

      const pagination = data.pagination as Record<string, unknown>;
      expect(pagination.page).toBe(1);
      expect(pagination.pageSize).toBe(20);
      expect(pagination.totalItems).toBe(0);
      expect(pagination.totalPages).toBe(0);
    });
  });

  // =========================================================================
  // RESPONSE SHAPE
  // =========================================================================
  describe("response shape", () => {
    it("should have { data: { items, pagination }, error: null } shape on success", async () => {
      const req = buildRequest();
      const res = await handler(req, createContext());

      const body = parseBody(res);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("error");
      expect(body.error).toBeNull();

      const data = body.data as Record<string, unknown>;
      expect(data).toHaveProperty("items");
      expect(data).toHaveProperty("pagination");
      expect(Array.isArray(data.items)).toBe(true);

      const pagination = data.pagination as Record<string, unknown>;
      expect(pagination).toHaveProperty("page");
      expect(pagination).toHaveProperty("pageSize");
      expect(pagination).toHaveProperty("totalItems");
      expect(pagination).toHaveProperty("totalPages");
    });
  });
});
