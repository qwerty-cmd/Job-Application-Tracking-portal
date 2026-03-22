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

function buildRequest(queryParams?: Record<string, string>): HttpRequest {
  const url = new URL("http://localhost/api/applications/stats");
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
  return new InvocationContext({ functionName: "getStats" });
}

function parseBody(response: { body?: unknown }): Record<string, unknown> {
  return JSON.parse(response.body as string);
}

// ---------------------------------------------------------------------------
// Test Fixtures — Cosmos DB documents
// ---------------------------------------------------------------------------

const APP_APPLYING = {
  id: "app-001",
  company: "Alpha Corp",
  role: "Engineer",
  dateApplied: "2026-03-05",
  status: "Applying",
  interviews: [],
  isDeleted: false,
  deletedAt: null,
};

const APP_SUBMITTED = {
  id: "app-002",
  company: "Beta Inc",
  role: "Designer",
  dateApplied: "2026-03-10",
  status: "Application Submitted",
  interviews: [],
  isDeleted: false,
  deletedAt: null,
};

const APP_INTERVIEW_STAGE = {
  id: "app-003",
  company: "Gamma Ltd",
  role: "PM",
  dateApplied: "2026-03-12",
  status: "Interview Stage",
  interviews: [
    {
      id: "int-001",
      round: 1,
      type: "Phone Screen",
      date: "2026-03-14",
      interviewers: "Jane",
      notes: "",
      reflection: "",
      outcome: "Passed",
      order: 1,
    },
    {
      id: "int-002",
      round: 2,
      type: "Technical",
      date: "2026-03-16",
      interviewers: "Bob",
      notes: "",
      reflection: "",
      outcome: "Pending",
      order: 2,
    },
  ],
  isDeleted: false,
  deletedAt: null,
};

const APP_REJECTED = {
  id: "app-004",
  company: "Delta Co",
  role: "Analyst",
  dateApplied: "2026-03-08",
  status: "Rejected",
  interviews: [
    {
      id: "int-003",
      round: 1,
      type: "Behavioral",
      date: "2026-03-10",
      interviewers: "Alice",
      notes: "",
      reflection: "",
      outcome: "Failed",
      order: 1,
    },
  ],
  isDeleted: false,
  deletedAt: null,
};

const APP_SOFT_DELETED = {
  id: "app-005",
  company: "Epsilon LLC",
  role: "Dev",
  dateApplied: "2026-03-06",
  status: "Applying",
  interviews: [
    {
      id: "int-004",
      round: 1,
      type: "Panel",
      date: "2026-03-09",
      interviewers: "Team",
      notes: "",
      reflection: "",
      outcome: "Passed",
      order: 1,
    },
  ],
  isDeleted: true,
  deletedAt: "2026-03-17T10:00:00Z",
};

const ALL_APPS = [
  APP_APPLYING,
  APP_SUBMITTED,
  APP_INTERVIEW_STAGE,
  APP_REJECTED,
  APP_SOFT_DELETED,
];

// Only non-deleted apps (what the query should return)
const ACTIVE_APPS = [
  APP_APPLYING,
  APP_SUBMITTED,
  APP_INTERVIEW_STAGE,
  APP_REJECTED,
];

// ---------------------------------------------------------------------------
// Import handler — does NOT exist yet → tests will fail at import time
// ---------------------------------------------------------------------------
import handler from "./index.ts";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authorized owner
    mockRequireOwner.mockReturnValue(null);
    // Default: Cosmos query returns active apps
    mockFetchAll.mockResolvedValue({ resources: ACTIVE_APPS });
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

      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
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

      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(403);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // =========================================================================
  // HAPPY PATH — with explicit query params
  // =========================================================================
  describe("happy path with query params", () => {
    it("should return 200 with correct period from query params", async () => {
      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const data = body.data as Record<string, unknown>;
      const period = data.period as Record<string, string>;
      expect(period.from).toBe("2026-03-01");
      expect(period.to).toBe("2026-03-18");
    });

    it("should return totalApplications as count of non-deleted apps", async () => {
      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      expect(data.totalApplications).toBe(4);
    });

    it("should return byStatus with correct counts per status", async () => {
      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const byStatus = data.byStatus as Record<string, number>;

      expect(byStatus["Applying"]).toBe(1);
      expect(byStatus["Application Submitted"]).toBe(1);
      expect(byStatus["Interview Stage"]).toBe(1);
      expect(byStatus["Rejected"]).toBe(1);
    });

    it("should return totalInterviews as sum of all interviews across apps", async () => {
      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      // APP_INTERVIEW_STAGE has 2. APP_REJECTED has 1. Total = 3.
      expect(data.totalInterviews).toBe(3);
    });

    it("should return interviewsByType with correct counts per type", async () => {
      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const interviewsByType = data.interviewsByType as Record<string, number>;

      expect(interviewsByType["Phone Screen"]).toBe(1);
      expect(interviewsByType["Technical"]).toBe(1);
      expect(interviewsByType["Behavioral"]).toBe(1);
    });
  });

  // =========================================================================
  // HAPPY PATH — defaults (no query params)
  // =========================================================================
  describe("happy path with defaults", () => {
    it("should default 'from' to first day of current month and 'to' to today when no params provided", async () => {
      const req = buildRequest();
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const data = body.data as Record<string, unknown>;
      const period = data.period as Record<string, string>;

      // Derive expected defaults based on current date
      const now = new Date();
      const expectedFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const expectedTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      expect(period.from).toBe(expectedFrom);
      expect(period.to).toBe(expectedTo);
    });
  });

  // =========================================================================
  // ALL STATUSES REPRESENTED
  // =========================================================================
  describe("all statuses represented", () => {
    it("should include all 8 status values in byStatus with zero for missing ones", async () => {
      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const byStatus = data.byStatus as Record<string, number>;

      // All 8 statuses must be present
      expect(byStatus).toHaveProperty("Applying");
      expect(byStatus).toHaveProperty("Application Submitted");
      expect(byStatus).toHaveProperty("Recruiter Screening");
      expect(byStatus).toHaveProperty("Interview Stage");
      expect(byStatus).toHaveProperty("Pending Offer");
      expect(byStatus).toHaveProperty("Accepted");
      expect(byStatus).toHaveProperty("Rejected");
      expect(byStatus).toHaveProperty("Withdrawn");

      // Statuses not in test data should be 0
      expect(byStatus["Recruiter Screening"]).toBe(0);
      expect(byStatus["Pending Offer"]).toBe(0);
      expect(byStatus["Accepted"]).toBe(0);
      expect(byStatus["Withdrawn"]).toBe(0);
    });
  });

  // =========================================================================
  // ALL INTERVIEW TYPES REPRESENTED
  // =========================================================================
  describe("all interview types represented", () => {
    it("should include all 7 interview types in interviewsByType with zero for missing ones", async () => {
      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const interviewsByType = data.interviewsByType as Record<string, number>;

      // All 7 types must be present
      expect(interviewsByType).toHaveProperty("Phone Screen");
      expect(interviewsByType).toHaveProperty("Technical");
      expect(interviewsByType).toHaveProperty("Behavioral");
      expect(interviewsByType).toHaveProperty("Case Study");
      expect(interviewsByType).toHaveProperty("Panel");
      expect(interviewsByType).toHaveProperty("Take Home Test");
      expect(interviewsByType).toHaveProperty("Other");

      // Types not in test data should be 0
      expect(interviewsByType["Case Study"]).toBe(0);
      expect(interviewsByType["Panel"]).toBe(0);
      expect(interviewsByType["Take Home Test"]).toBe(0);
      expect(interviewsByType["Other"]).toBe(0);
    });
  });

  // =========================================================================
  // OUTCOMES BY STAGE
  // =========================================================================
  describe("outcomes by stage", () => {
    it("should count 'No Response' for apps stuck at Applying/Application Submitted", async () => {
      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const outcomesByStage = data.outcomesByStage as Record<string, number>;
      // APP_APPLYING + APP_SUBMITTED = 2 no-response
      expect(outcomesByStage["No Response"]).toBe(2);
    });

    it("should count rejected apps by their furthest interview stage", async () => {
      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const outcomesByStage = data.outcomesByStage as Record<string, number>;
      // APP_REJECTED has 1 Behavioral interview
      expect(outcomesByStage["Behavioral"]).toBe(1);
    });

    it("should not count active apps (Interview Stage, Pending Offer, etc.) in outcomes", async () => {
      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const outcomesByStage = data.outcomesByStage as Record<string, number>;
      // APP_INTERVIEW_STAGE has Phone Screen + Technical, but is still active
      // Phone Screen and Technical should be 0 in outcomesByStage
      expect(outcomesByStage["Phone Screen"]).toBe(0);
      expect(outcomesByStage["Technical"]).toBe(0);
    });

    it("should count 'Pre-Interview' for rejected apps with no interviews", async () => {
      const rejectedNoInterviews = {
        id: "app-pre",
        company: "Zeta",
        role: "Dev",
        dateApplied: "2026-03-07",
        status: "Rejected",
        interviews: [],
        isDeleted: false,
        deletedAt: null,
      };
      mockFetchAll.mockResolvedValue({
        resources: [...ACTIVE_APPS, rejectedNoInterviews],
      });

      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const outcomesByStage = data.outcomesByStage as Record<string, number>;
      expect(outcomesByStage["Pre-Interview"]).toBe(1);
    });

    it("should not count soft-deleted apps in outcomesByStage", async () => {
      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const outcomesByStage = data.outcomesByStage as Record<string, number>;
      // Soft-deleted app was "Applying" with a Panel interview — should not appear
      expect(outcomesByStage["Panel"]).toBe(0);
    });
  });

  // =========================================================================
  describe("soft-deleted excluded", () => {
    it("should not count soft-deleted applications in totalApplications", async () => {
      // The query itself should filter isDeleted = false,
      // but even if all docs are returned, handler must exclude deleted
      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      // 4 active apps, not 5
      expect(data.totalApplications).toBe(4);
    });

    it("should not count interviews from soft-deleted applications", async () => {
      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      // Active apps have 3 interviews total. Deleted app has 1 Panel — should not count.
      expect(data.totalInterviews).toBe(3);

      const interviewsByType = data.interviewsByType as Record<string, number>;
      expect(interviewsByType["Panel"]).toBe(0);
    });

    it("should not count the status of soft-deleted applications in byStatus", async () => {
      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const data = body.data as Record<string, unknown>;
      const byStatus = data.byStatus as Record<string, number>;
      // Deleted app was "Applying" — active "Applying" count should be 1, not 2
      expect(byStatus["Applying"]).toBe(1);
    });
  });

  // =========================================================================
  // EMPTY RESULTS
  // =========================================================================
  describe("empty results", () => {
    it("should return all zeros when no applications match the date range", async () => {
      mockFetchAll.mockResolvedValue({ resources: [] });

      const req = buildRequest({ from: "2025-01-01", to: "2025-01-31" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const data = body.data as Record<string, unknown>;
      expect(data.totalApplications).toBe(0);
      expect(data.totalInterviews).toBe(0);

      const byStatus = data.byStatus as Record<string, number>;
      expect(byStatus["Applying"]).toBe(0);
      expect(byStatus["Application Submitted"]).toBe(0);
      expect(byStatus["Recruiter Screening"]).toBe(0);
      expect(byStatus["Interview Stage"]).toBe(0);
      expect(byStatus["Pending Offer"]).toBe(0);
      expect(byStatus["Accepted"]).toBe(0);
      expect(byStatus["Rejected"]).toBe(0);
      expect(byStatus["Withdrawn"]).toBe(0);

      const interviewsByType = data.interviewsByType as Record<string, number>;
      expect(interviewsByType["Phone Screen"]).toBe(0);
      expect(interviewsByType["Technical"]).toBe(0);
      expect(interviewsByType["Behavioral"]).toBe(0);
      expect(interviewsByType["Case Study"]).toBe(0);
      expect(interviewsByType["Panel"]).toBe(0);
      expect(interviewsByType["Take Home Test"]).toBe(0);
      expect(interviewsByType["Other"]).toBe(0);

      const outcomesByStage = data.outcomesByStage as Record<string, number>;
      expect(outcomesByStage["No Response"]).toBe(0);
      expect(outcomesByStage["Pre-Interview"]).toBe(0);
      expect(outcomesByStage["Phone Screen"]).toBe(0);
      expect(outcomesByStage["Behavioral"]).toBe(0);
    });
  });

  // =========================================================================
  // RESPONSE SHAPE
  // =========================================================================
  describe("response shape", () => {
    it("should return { data, error: null } on success matching the documented schema", async () => {
      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("error");
      expect(body.error).toBeNull();

      const data = body.data as Record<string, unknown>;
      expect(data).toHaveProperty("period");
      expect(data).toHaveProperty("totalApplications");
      expect(data).toHaveProperty("byStatus");
      expect(data).toHaveProperty("totalInterviews");
      expect(data).toHaveProperty("interviewsByType");
      expect(data).toHaveProperty("outcomesByStage");
    });

    it("should set Content-Type to application/json", async () => {
      const req = buildRequest({ from: "2026-03-01", to: "2026-03-18" });
      const res = await handler(req, createContext());

      const headers = res.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });
});
