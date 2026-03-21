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

// Mock @azure/storage-blob
const mockGenerateSasUrl = vi.fn();
const mockGetBlockBlobClient = vi.fn(() => ({
  url: "https://stjobtrackermliokt.blob.core.windows.net/resumes/abc-123/1710498900000-my-resume.pdf",
  generateSasUrl: mockGenerateSasUrl,
}));
const mockGetContainerClient = vi.fn(() => ({
  getBlockBlobClient: mockGetBlockBlobClient,
}));
vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: vi.fn(() => ({
    getContainerClient: mockGetContainerClient,
  })),
  BlobSASPermissions: { parse: vi.fn().mockReturnValue({}) },
  StorageSharedKeyCredential: vi.fn(),
}));

// Mock shared storageClient (handlers import getBlobServiceClient from here)
const mockBlobServiceClient = { getContainerClient: mockGetContainerClient };
vi.mock("../../shared/storageClient.js", () => ({
  getBlobServiceClient: vi.fn(() => mockBlobServiceClient),
  getStorageAccountName: vi.fn(() => "stjobtrackermliokt"),
  getStorageCredential: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(body: Record<string, unknown>): HttpRequest {
  return new HttpRequest({
    method: "POST",
    url: "http://localhost/api/upload/sas-token",
    body: { string: JSON.stringify(body) },
    headers: { "Content-Type": "application/json" },
  });
}

function createContext(): InvocationContext {
  return new InvocationContext({ functionName: "uploadSasToken" });
}

function parseBody(response: { body?: unknown }): Record<string, unknown> {
  return JSON.parse(response.body as string);
}

const VALID_RESUME_BODY = {
  applicationId: "abc-123",
  fileType: "resume",
  fileName: "my-resume.pdf",
  contentType: "application/pdf",
};

const VALID_COVER_LETTER_BODY = {
  applicationId: "abc-123",
  fileType: "coverLetter",
  fileName: "cover-letter.docx",
  contentType:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const VALID_JOB_DESCRIPTION_BODY = {
  applicationId: "abc-123",
  fileType: "jobDescription",
  fileName: "job-desc.html",
  contentType: "text/html",
};

// Existing application in Cosmos (not soft-deleted)
const EXISTING_APPLICATION = {
  id: "abc-123",
  company: "Contoso Ltd",
  role: "Senior Cloud Engineer",
  isDeleted: false,
  deletedAt: null,
};

// Soft-deleted application
const DELETED_APPLICATION = {
  ...EXISTING_APPLICATION,
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

describe("uploadSasToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authorized owner
    mockRequireOwner.mockReturnValue(null);
    // Default: Cosmos read returns an existing application
    mockRead.mockResolvedValue({ resource: EXISTING_APPLICATION });
    // Default: generateSasUrl returns a URL with SAS token
    mockGenerateSasUrl.mockResolvedValue(
      "https://stjobtrackermliokt.blob.core.windows.net/resumes/abc-123/1710498900000-my-resume.pdf?sv=2021-06-08&se=2026-03-15T10:35:00Z&sr=b&sp=cw&sig=fakesig",
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

      const req = buildRequest(VALID_RESUME_BODY);
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

      const req = buildRequest(VALID_RESUME_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(403);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // =========================================================================
  // VALIDATION
  // =========================================================================
  describe("validation", () => {
    it("should return 400 when applicationId is missing", async () => {
      const req = buildRequest({
        fileType: "resume",
        fileName: "my-resume.pdf",
        contentType: "application/pdf",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "VALIDATION_ERROR" });
      const details = (body.error as Record<string, unknown>).details as Array<
        Record<string, string>
      >;
      expect(details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "applicationId" }),
        ]),
      );
    });

    it("should return 400 when fileType is invalid", async () => {
      const req = buildRequest({
        ...VALID_RESUME_BODY,
        fileType: "transcript",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "VALIDATION_ERROR" });
      const details = (body.error as Record<string, unknown>).details as Array<
        Record<string, string>
      >;
      expect(details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "fileType" }),
        ]),
      );
    });

    it("should return 400 when fileName is missing", async () => {
      const req = buildRequest({
        applicationId: "abc-123",
        fileType: "resume",
        contentType: "application/pdf",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "VALIDATION_ERROR" });
      const details = (body.error as Record<string, unknown>).details as Array<
        Record<string, string>
      >;
      expect(details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "fileName" }),
        ]),
      );
    });

    it("should return 400 when fileName has disallowed extension for fileType", async () => {
      // resume only allows .pdf and .docx, not .html
      const req = buildRequest({
        ...VALID_RESUME_BODY,
        fileName: "my-resume.html",
        contentType: "text/html",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "VALIDATION_ERROR" });
      const details = (body.error as Record<string, unknown>).details as Array<
        Record<string, string>
      >;
      expect(details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "fileName" }),
        ]),
      );
    });

    it("should return 400 when contentType is missing", async () => {
      const req = buildRequest({
        applicationId: "abc-123",
        fileType: "resume",
        fileName: "my-resume.pdf",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "VALIDATION_ERROR" });
      const details = (body.error as Record<string, unknown>).details as Array<
        Record<string, string>
      >;
      expect(details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "contentType" }),
        ]),
      );
    });

    it("should return 400 when contentType does not match file extension", async () => {
      // .pdf file with wrong contentType
      const req = buildRequest({
        ...VALID_RESUME_BODY,
        contentType: "text/html",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(400);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "VALIDATION_ERROR" });
      const details = (body.error as Record<string, unknown>).details as Array<
        Record<string, string>
      >;
      expect(details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "contentType" }),
        ]),
      );
    });
  });

  // =========================================================================
  // NOT FOUND
  // =========================================================================
  describe("not found", () => {
    it("should return 404 when applicationId does not exist in Cosmos", async () => {
      mockRead.mockResolvedValue({ resource: undefined });

      const req = buildRequest({
        ...VALID_RESUME_BODY,
        applicationId: "nonexistent-id",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });

    it("should return 404 when application is soft-deleted", async () => {
      mockRead.mockResolvedValue({ resource: DELETED_APPLICATION });

      const req = buildRequest({
        ...VALID_RESUME_BODY,
        applicationId: "del-789",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // =========================================================================
  // HAPPY PATH
  // =========================================================================
  describe("happy path", () => {
    it("should return 200 with upload URL for resume (PDF)", async () => {
      const req = buildRequest(VALID_RESUME_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const data = body.data as Record<string, unknown>;
      expect(data.uploadUrl).toBeDefined();
      expect(typeof data.uploadUrl).toBe("string");
      expect(data.blobPath).toBeDefined();
      expect(typeof data.blobPath).toBe("string");
      expect((data.blobPath as string).startsWith("resumes/abc-123/")).toBe(
        true,
      );
      expect((data.blobPath as string).endsWith("-my-resume.pdf")).toBe(true);
      expect(data.expiresAt).toBeDefined();
      expect(typeof data.expiresAt).toBe("string");

      // Verify correct container was used
      expect(mockGetContainerClient).toHaveBeenCalledWith("resumes");
    });

    it("should return 200 with upload URL for coverLetter (DOCX)", async () => {
      const req = buildRequest(VALID_COVER_LETTER_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const data = body.data as Record<string, unknown>;
      expect(data.uploadUrl).toBeDefined();
      expect(data.blobPath).toBeDefined();
      expect(
        (data.blobPath as string).startsWith("coverletters/abc-123/"),
      ).toBe(true);
      expect((data.blobPath as string).endsWith("-cover-letter.docx")).toBe(
        true,
      );
      expect(data.expiresAt).toBeDefined();

      // Verify correct container was used
      expect(mockGetContainerClient).toHaveBeenCalledWith("coverletters");
    });

    it("should return 200 with upload URL for jobDescription (HTML)", async () => {
      const req = buildRequest(VALID_JOB_DESCRIPTION_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const data = body.data as Record<string, unknown>;
      expect(data.uploadUrl).toBeDefined();
      expect(data.blobPath).toBeDefined();
      expect(
        (data.blobPath as string).startsWith("jobdescriptions/abc-123/"),
      ).toBe(true);
      expect((data.blobPath as string).endsWith("-job-desc.html")).toBe(true);
      expect(data.expiresAt).toBeDefined();

      // Verify correct container was used
      expect(mockGetContainerClient).toHaveBeenCalledWith("jobdescriptions");
    });
  });

  // =========================================================================
  // INVALID BODY
  // =========================================================================
  describe("invalid body", () => {
    it("should return 400 when request body is not valid JSON", async () => {
      const req = new HttpRequest({
        method: "POST",
        url: "http://localhost/api/upload/sas-token",
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
  // ERROR HANDLING
  // =========================================================================
  describe("error handling", () => {
    it("should return 500 on unexpected error", async () => {
      mockRead.mockRejectedValue(new Error("Cosmos connection failed"));

      const req = buildRequest(VALID_RESUME_BODY);
      const res = await handler(req, createContext());

      expect(res.status).toBe(500);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "INTERNAL_ERROR" });
    });
  });
});
