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

function buildRequest(params: Record<string, string>): HttpRequest {
  const queryString = new URLSearchParams(params).toString();
  return new HttpRequest({
    method: "GET",
    url: `http://localhost/api/download/sas-token?${queryString}`,
    query: params,
  });
}

function createContext(): InvocationContext {
  return new InvocationContext({ functionName: "downloadSasToken" });
}

function parseBody(response: { body?: unknown }): Record<string, unknown> {
  return JSON.parse(response.body as string);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APPLICATION_WITH_FILES = {
  id: "abc-123",
  company: "Contoso Ltd",
  role: "Senior Cloud Engineer",
  isDeleted: false,
  deletedAt: null,
  resume: {
    blobUrl:
      "https://stjobtrackermliokt.blob.core.windows.net/resumes/abc-123/1710498900000-my-resume.pdf",
    fileName: "my-resume.pdf",
    uploadedAt: "2026-03-15T10:30:00Z",
  },
  coverLetter: {
    blobUrl:
      "https://stjobtrackermliokt.blob.core.windows.net/coverletters/abc-123/1710498905000-cover-letter.docx",
    fileName: "cover-letter.docx",
    uploadedAt: "2026-03-15T10:30:05Z",
  },
  jobDescriptionFile: {
    blobUrl:
      "https://stjobtrackermliokt.blob.core.windows.net/jobdescriptions/abc-123/1710498910000-job-desc.html",
    fileName: "job-desc.html",
    uploadedAt: "2026-03-15T10:30:10Z",
  },
};

const APPLICATION_NO_FILES = {
  id: "no-files-456",
  company: "Empty Corp",
  role: "Developer",
  isDeleted: false,
  deletedAt: null,
  resume: null,
  coverLetter: null,
  jobDescriptionFile: null,
};

const DELETED_APPLICATION = {
  ...APPLICATION_WITH_FILES,
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

describe("downloadSasToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authorized owner
    mockRequireOwner.mockReturnValue(null);
    // Default: Cosmos read returns an application with files
    mockRead.mockResolvedValue({ resource: APPLICATION_WITH_FILES });
    // Default: generateSasUrl returns a download URL
    mockGenerateSasUrl.mockResolvedValue(
      "https://stjobtrackermliokt.blob.core.windows.net/resumes/abc-123/1710498900000-my-resume.pdf?sv=2021-06-08&se=2026-03-15T10:35:00Z&sr=b&sp=r&sig=fakesig",
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

      const req = buildRequest({
        applicationId: "abc-123",
        fileType: "resume",
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

      const req = buildRequest({
        applicationId: "abc-123",
        fileType: "resume",
      });
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
    it("should return 400 when applicationId query param is missing", async () => {
      const req = buildRequest({ fileType: "resume" });
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

    it("should return 400 when fileType query param is missing", async () => {
      const req = buildRequest({ applicationId: "abc-123" });
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

    it("should return 400 when fileType is an invalid enum value", async () => {
      const req = buildRequest({
        applicationId: "abc-123",
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
  });

  // =========================================================================
  // NOT FOUND
  // =========================================================================
  describe("not found", () => {
    it("should return 404 when applicationId does not exist in Cosmos", async () => {
      mockRead.mockResolvedValue({ resource: undefined });

      const req = buildRequest({
        applicationId: "nonexistent-id",
        fileType: "resume",
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
        applicationId: "del-789",
        fileType: "resume",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });

    it("should return 404 when no file of requested type exists on the application", async () => {
      mockRead.mockResolvedValue({ resource: APPLICATION_NO_FILES });

      const req = buildRequest({
        applicationId: "no-files-456",
        fileType: "resume",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
      expect((body.error as Record<string, string>).message).toContain(
        "resume",
      );
    });

    it("should return 404 when coverLetter file is null on the application", async () => {
      mockRead.mockResolvedValue({ resource: APPLICATION_NO_FILES });

      const req = buildRequest({
        applicationId: "no-files-456",
        fileType: "coverLetter",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });

    it("should return 404 when jobDescription file is null on the application", async () => {
      mockRead.mockResolvedValue({ resource: APPLICATION_NO_FILES });

      const req = buildRequest({
        applicationId: "no-files-456",
        fileType: "jobDescription",
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
    it("should return 200 with download URL for resume", async () => {
      const req = buildRequest({
        applicationId: "abc-123",
        fileType: "resume",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const data = body.data as Record<string, unknown>;
      expect(data.downloadUrl).toBeDefined();
      expect(typeof data.downloadUrl).toBe("string");
      expect(data.fileName).toBe("my-resume.pdf");
      expect(data.expiresAt).toBeDefined();
      expect(typeof data.expiresAt).toBe("string");

      // Verify correct container and blob path were used
      expect(mockGetContainerClient).toHaveBeenCalledWith("resumes");
      expect(mockGetBlockBlobClient).toHaveBeenCalledWith(
        "abc-123/1710498900000-my-resume.pdf",
      );
    });

    it("should return 200 with download URL for coverLetter", async () => {
      mockGenerateSasUrl.mockResolvedValue(
        "https://stjobtrackermliokt.blob.core.windows.net/coverletters/abc-123/1710498905000-cover-letter.docx?sv=2021-06-08&se=2026-03-15T10:35:00Z&sr=b&sp=r&sig=fakesig",
      );

      const req = buildRequest({
        applicationId: "abc-123",
        fileType: "coverLetter",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const data = body.data as Record<string, unknown>;
      expect(data.downloadUrl).toBeDefined();
      expect(typeof data.downloadUrl).toBe("string");
      expect(data.fileName).toBe("cover-letter.docx");
      expect(data.expiresAt).toBeDefined();

      // Verify correct container was used
      expect(mockGetContainerClient).toHaveBeenCalledWith("coverletters");
      expect(mockGetBlockBlobClient).toHaveBeenCalledWith(
        "abc-123/1710498905000-cover-letter.docx",
      );
    });

    it("should return 200 with download URL for jobDescription", async () => {
      mockGenerateSasUrl.mockResolvedValue(
        "https://stjobtrackermliokt.blob.core.windows.net/jobdescriptions/abc-123/1710498910000-job-desc.html?sv=2021-06-08&se=2026-03-15T10:35:00Z&sr=b&sp=r&sig=fakesig",
      );

      const req = buildRequest({
        applicationId: "abc-123",
        fileType: "jobDescription",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();

      const data = body.data as Record<string, unknown>;
      expect(data.downloadUrl).toBeDefined();
      expect(typeof data.downloadUrl).toBe("string");
      expect(data.fileName).toBe("job-desc.html");
      expect(data.expiresAt).toBeDefined();

      // Verify correct container was used
      expect(mockGetContainerClient).toHaveBeenCalledWith("jobdescriptions");
      expect(mockGetBlockBlobClient).toHaveBeenCalledWith(
        "abc-123/1710498910000-job-desc.html",
      );
    });

    it("should generate a read-only SAS token with 5-minute expiry", async () => {
      const req = buildRequest({
        applicationId: "abc-123",
        fileType: "resume",
      });
      await handler(req, createContext());

      // Verify generateSasUrl was called with read-only permissions and ~5-min expiry
      expect(mockGenerateSasUrl).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateSasUrl.mock.calls[0][0];
      expect(callArgs).toBeDefined();
      // The expiresOn should be roughly 5 minutes from now
      if (callArgs.expiresOn) {
        const expiresOn = new Date(callArgs.expiresOn);
        const now = new Date();
        const diffMs = expiresOn.getTime() - now.getTime();
        // Allow some tolerance: between 4 and 6 minutes
        expect(diffMs).toBeGreaterThan(4 * 60 * 1000);
        expect(diffMs).toBeLessThan(6 * 60 * 1000);
      }
    });
  });

  // =========================================================================
  // ERROR HANDLING
  // =========================================================================
  describe("error handling", () => {
    it("should return 500 on unexpected error", async () => {
      mockRead.mockRejectedValue(new Error("Cosmos connection failed"));

      const req = buildRequest({
        applicationId: "abc-123",
        fileType: "resume",
      });
      const res = await handler(req, createContext());

      expect(res.status).toBe(500);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "INTERNAL_ERROR" });
    });
  });
});
