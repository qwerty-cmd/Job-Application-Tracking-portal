import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpRequest, InvocationContext } from "@azure/functions";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Cosmos DB — provide a mock container with items.create()
const mockCreate = vi.fn();
vi.mock("../../shared/cosmosClient.js", () => ({
  getContainer: vi.fn(() => ({
    items: { create: mockCreate },
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
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): HttpRequest {
  return new HttpRequest({
    method: "POST",
    url: "http://localhost/api/applications",
    headers: { "Content-Type": "application/json", ...headers },
    body: { string: JSON.stringify(body) },
  });
}

function createContext(): InvocationContext {
  return new InvocationContext({ functionName: "createApplication" });
}

function parseBody(response: { body?: unknown }): Record<string, unknown> {
  return JSON.parse(response.body as string);
}

const VALID_MINIMAL_BODY = {
  company: "Contoso Ltd",
  role: "Software Engineer",
  dateApplied: "2026-03-15",
};

const VALID_FULL_BODY = {
  company: "Contoso Ltd",
  role: "Senior Cloud Engineer",
  location: {
    city: "Sydney",
    country: "Australia",
    workMode: "Hybrid",
    other: null,
  },
  dateApplied: "2026-03-15",
  status: "Applying",
  jobPostingUrl: "https://careers.contoso.com/job/12345",
  jobDescriptionText: "We are looking for a Senior Cloud Engineer to...",
};

// ---------------------------------------------------------------------------
// Import handler — does NOT exist yet → tests will fail at import time
// ---------------------------------------------------------------------------
// The implementation file will be at ./index.ts and default-export the handler.
import handler from "./index.ts";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createApplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authorized owner
    mockRequireOwner.mockReturnValue(null);
    // Default: Cosmos create succeeds and returns the doc it received
    mockCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
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

      const req = buildRequest(VALID_MINIMAL_BODY);
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

      const req = buildRequest(VALID_MINIMAL_BODY);
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
    it("should return 201 with full document on valid minimal input", async () => {
      const req = buildRequest(VALID_MINIMAL_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const app = body.data as Record<string, unknown>;
      // Generated fields
      expect(app.id).toBeDefined();
      expect(typeof app.id).toBe("string");
      expect(app.createdAt).toBeDefined();
      expect(app.updatedAt).toBeDefined();

      // Input fields carried through
      expect(app.company).toBe("Contoso Ltd");
      expect(app.role).toBe("Software Engineer");
      expect(app.dateApplied).toBe("2026-03-15");

      // Defaults
      expect(app.status).toBe("Applying");
      expect(app.interviews).toEqual([]);
      expect(app.isDeleted).toBe(false);
      expect(app.deletedAt).toBeNull();
      expect(app.resume).toBeNull();
      expect(app.coverLetter).toBeNull();
      expect(app.jobDescriptionFile).toBeNull();
      expect(app.rejection).toBeNull();
      expect(app.jobPostingUrl).toBeNull();
      expect(app.jobDescriptionText).toBeNull();
    });

    it("should return 201 with full document when all optional fields are provided", async () => {
      const req = buildRequest(VALID_FULL_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const app = body.data as Record<string, unknown>;
      expect(app.company).toBe("Contoso Ltd");
      expect(app.role).toBe("Senior Cloud Engineer");
      expect(app.dateApplied).toBe("2026-03-15");
      expect(app.status).toBe("Applying");
      expect(app.jobPostingUrl).toBe("https://careers.contoso.com/job/12345");
      expect(app.jobDescriptionText).toBe(
        "We are looking for a Senior Cloud Engineer to...",
      );

      const location = app.location as Record<string, unknown>;
      expect(location.city).toBe("Sydney");
      expect(location.country).toBe("Australia");
      expect(location.workMode).toBe("Hybrid");
      expect(location.other).toBeNull();
    });

    it("should force status to Applying regardless of provided status", async () => {
      const req = buildRequest({
        ...VALID_MINIMAL_BODY,
        status: "Application Submitted",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;
      expect(app.status).toBe("Applying");
    });

    it("should call Cosmos create with the generated document", async () => {
      const req = buildRequest(VALID_MINIMAL_BODY);
      await handler(req, createContext());

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const createdDoc = mockCreate.mock.calls[0][0];
      expect(createdDoc.company).toBe("Contoso Ltd");
      expect(createdDoc.id).toBeDefined();
    });
  });

  // =========================================================================
  // RESPONSE SHAPE
  // =========================================================================
  describe("response shape", () => {
    it("should have { data, error: null } shape on success", async () => {
      const req = buildRequest(VALID_MINIMAL_BODY);
      const res = await handler(req, createContext());

      const body = parseBody(res);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("error");
      expect(body.error).toBeNull();
      expect(body.data).not.toBeNull();
    });

    it("should have { data: null, error: { code, message, details } } shape on validation error", async () => {
      const req = buildRequest({});
      const res = await handler(req, createContext());

      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).not.toBeNull();

      const error = body.error as Record<string, unknown>;
      expect(error).toHaveProperty("code");
      expect(error).toHaveProperty("message");
      expect(error).toHaveProperty("details");
    });

    it("should include all expected fields in the created application", async () => {
      const req = buildRequest(VALID_MINIMAL_BODY);
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;

      const expectedFields = [
        "id",
        "company",
        "role",
        "location",
        "dateApplied",
        "jobPostingUrl",
        "jobDescriptionText",
        "jobDescriptionFile",
        "status",
        "resume",
        "coverLetter",
        "rejection",
        "interviews",
        "isDeleted",
        "deletedAt",
        "createdAt",
        "updatedAt",
      ];
      for (const field of expectedFields) {
        expect(app).toHaveProperty(field);
      }
    });
  });

  // =========================================================================
  // VALIDATION ERRORS (400)
  // =========================================================================
  describe("validation", () => {
    it("should return 400 when company is missing", async () => {
      const req = buildRequest({ role: "Engineer", dateApplied: "2026-03-15" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();

      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
      const details = error.details as Array<{
        field: string;
        message: string;
      }>;
      expect(details.some((d) => d.field === "company")).toBe(true);
    });

    it("should return 400 when role is missing", async () => {
      const req = buildRequest({
        company: "Contoso",
        dateApplied: "2026-03-15",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
      const details = error.details as Array<{
        field: string;
        message: string;
      }>;
      expect(details.some((d) => d.field === "role")).toBe(true);
    });

    it("should return 400 when dateApplied is missing", async () => {
      const req = buildRequest({ company: "Contoso", role: "Engineer" });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
      const details = error.details as Array<{
        field: string;
        message: string;
      }>;
      expect(details.some((d) => d.field === "dateApplied")).toBe(true);
    });

    it("should return 400 when dateApplied is in the future", async () => {
      const req = buildRequest({
        company: "Contoso",
        role: "Engineer",
        dateApplied: "2099-12-31",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      const error = body.error as Record<string, unknown>;
      const details = error.details as Array<{
        field: string;
        message: string;
      }>;
      const dateError = details.find((d) => d.field === "dateApplied");
      expect(dateError).toBeDefined();
      expect(dateError!.message).toContain("future");
    });

    it("should return 400 when dateApplied has invalid format", async () => {
      const req = buildRequest({
        company: "Contoso",
        role: "Engineer",
        dateApplied: "not-a-date",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      const error = body.error as Record<string, unknown>;
      const details = error.details as Array<{
        field: string;
        message: string;
      }>;
      expect(details.some((d) => d.field === "dateApplied")).toBe(true);
    });

    it("should return 400 when company exceeds 200 characters", async () => {
      const req = buildRequest({
        company: "A".repeat(201),
        role: "Engineer",
        dateApplied: "2026-03-15",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      const error = body.error as Record<string, unknown>;
      const details = error.details as Array<{
        field: string;
        message: string;
      }>;
      expect(details.some((d) => d.field === "company")).toBe(true);
    });

    it("should return 400 when role exceeds 200 characters", async () => {
      const req = buildRequest({
        company: "Contoso",
        role: "E".repeat(201),
        dateApplied: "2026-03-15",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      const error = body.error as Record<string, unknown>;
      const details = error.details as Array<{
        field: string;
        message: string;
      }>;
      expect(details.some((d) => d.field === "role")).toBe(true);
    });

    it("should return 400 when status is an invalid enum value", async () => {
      const req = buildRequest({
        ...VALID_MINIMAL_BODY,
        status: "InvalidStatus",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      const error = body.error as Record<string, unknown>;
      const details = error.details as Array<{
        field: string;
        message: string;
      }>;
      expect(details.some((d) => d.field === "status")).toBe(true);
    });

    it("should return 400 when location.workMode is invalid", async () => {
      const req = buildRequest({
        ...VALID_MINIMAL_BODY,
        location: { city: "Sydney", country: "AU", workMode: "InOffice" },
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      const error = body.error as Record<string, unknown>;
      const details = error.details as Array<{
        field: string;
        message: string;
      }>;
      expect(details.some((d) => d.field === "location.workMode")).toBe(true);
    });

    it("should return 400 when jobPostingUrl is not a valid URL", async () => {
      const req = buildRequest({
        ...VALID_MINIMAL_BODY,
        jobPostingUrl: "not-a-url",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      const error = body.error as Record<string, unknown>;
      const details = error.details as Array<{
        field: string;
        message: string;
      }>;
      expect(details.some((d) => d.field === "jobPostingUrl")).toBe(true);
    });

    it("should return 400 when jobDescriptionText exceeds 50,000 characters", async () => {
      const req = buildRequest({
        ...VALID_MINIMAL_BODY,
        jobDescriptionText: "x".repeat(50001),
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      const error = body.error as Record<string, unknown>;
      const details = error.details as Array<{
        field: string;
        message: string;
      }>;
      expect(details.some((d) => d.field === "jobDescriptionText")).toBe(true);
    });

    it("should return 400 when status is Rejected but rejection.reason is missing", async () => {
      const req = buildRequest({
        ...VALID_MINIMAL_BODY,
        status: "Rejected",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      const error = body.error as Record<string, unknown>;
      const details = error.details as Array<{
        field: string;
        message: string;
      }>;
      expect(details.some((d) => d.field === "rejection.reason")).toBe(true);
    });

    it("should return 400 when rejection.reason is an invalid enum value", async () => {
      const req = buildRequest({
        ...VALID_MINIMAL_BODY,
        status: "Rejected",
        rejection: { reason: "BadLuck", notes: "" },
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      const error = body.error as Record<string, unknown>;
      const details = error.details as Array<{
        field: string;
        message: string;
      }>;
      expect(details.some((d) => d.field === "rejection.reason")).toBe(true);
    });

    it("should return 400 with multiple validation errors at once", async () => {
      const req = buildRequest({
        dateApplied: "2099-12-31",
        status: "InvalidStatus",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      const error = body.error as Record<string, unknown>;
      expect(error.code).toBe("VALIDATION_ERROR");
      const details = error.details as Array<{
        field: string;
        message: string;
      }>;
      // At minimum: company missing, role missing, dateApplied future, status invalid
      expect(details.length).toBeGreaterThanOrEqual(3);
    });
  });

  // =========================================================================
  // EDGE CASES
  // =========================================================================
  describe("edge cases", () => {
    it("should accept null optional fields without error", async () => {
      const req = buildRequest({
        ...VALID_MINIMAL_BODY,
        jobPostingUrl: null,
        jobDescriptionText: null,
        location: null,
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;
      expect(app.jobPostingUrl).toBeNull();
      expect(app.jobDescriptionText).toBeNull();
      expect(app.location).toBeNull();
    });

    it("should default status to Applying when not provided", async () => {
      const req = buildRequest(VALID_MINIMAL_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;
      expect(app.status).toBe("Applying");
    });

    it("should store rejection data but force status to Applying when status Rejected is sent", async () => {
      const req = buildRequest({
        ...VALID_MINIMAL_BODY,
        status: "Rejected",
        rejection: { reason: "Ghosted", notes: "No response after 2 weeks" },
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;
      expect(app.status).toBe("Applying");
      const rejection = app.rejection as Record<string, unknown>;
      expect(rejection.reason).toBe("Ghosted");
      expect(rejection.notes).toBe("No response after 2 weeks");
    });

    it("should generate different IDs for separate requests", async () => {
      const req1 = buildRequest(VALID_MINIMAL_BODY);
      const req2 = buildRequest({
        ...VALID_MINIMAL_BODY,
        company: "Other Corp",
      });

      const res1 = await handler(req1, createContext());
      const res2 = await handler(req2, createContext());

      const id1 = (parseBody(res1).data as Record<string, unknown>).id;
      const id2 = (parseBody(res2).data as Record<string, unknown>).id;
      expect(id1).not.toBe(id2);
    });

    it("should set createdAt and updatedAt to the same timestamp", async () => {
      const req = buildRequest(VALID_MINIMAL_BODY);
      const res = await handler(req, createContext());

      const body = parseBody(res);
      const app = body.data as Record<string, unknown>;
      expect(app.createdAt).toBe(app.updatedAt);
    });

    it("should accept company and role at exactly 200 characters", async () => {
      const req = buildRequest({
        company: "C".repeat(200),
        role: "R".repeat(200),
        dateApplied: "2026-03-15",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
    });

    it("should accept dateApplied set to today", async () => {
      const today = new Date().toISOString().split("T")[0];
      const req = buildRequest({
        company: "Contoso",
        role: "Engineer",
        dateApplied: today,
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(201);
    });

    it("should return 400 when request body is not valid JSON", async () => {
      const req = new HttpRequest({
        method: "POST",
        url: "http://localhost/api/applications",
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
});
