import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpRequest, InvocationContext } from "@azure/functions";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRead = vi.fn();
const mockReplace = vi.fn();
vi.mock("../../shared/cosmosClient.js", () => ({
  getContainer: vi.fn(() => ({
    item: vi.fn(() => ({ read: mockRead, replace: mockReplace })),
  })),
}));

const mockRequireOwner = vi.fn();
vi.mock("../../shared/auth.js", () => ({
  requireOwner: (...args: unknown[]) => mockRequireOwner(...args),
}));

const mockDeleteBlob = vi.fn();
const mockGetBlockBlobClient = vi.fn(() => ({
  deleteIfExists: mockDeleteBlob,
}));
const mockGetContainerClient = vi.fn(() => ({
  getBlockBlobClient: mockGetBlockBlobClient,
}));
vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: vi.fn(() => ({
    getContainerClient: mockGetContainerClient,
  })),
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

function buildRequest(id: string, fileType: string): HttpRequest {
  return new HttpRequest({
    method: "DELETE",
    url: `http://localhost/api/applications/${id}/files/${fileType}`,
    params: { id, fileType },
  });
}

function createContext(): InvocationContext {
  return new InvocationContext({ functionName: "deleteFile" });
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
  interviews: [],
  createdAt: "2026-03-15T10:30:00Z",
  updatedAt: "2026-03-15T10:30:00Z",
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
  interviews: [],
  createdAt: "2026-03-15T10:30:00Z",
  updatedAt: "2026-03-15T10:30:00Z",
};

const DELETED_APPLICATION = {
  ...APPLICATION_WITH_FILES,
  id: "del-789",
  isDeleted: true,
  deletedAt: "2026-03-19T09:00:00Z",
};

// ---------------------------------------------------------------------------
// Import handler
// ---------------------------------------------------------------------------
import handler from "./index.ts";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("deleteFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockReturnValue(null);
    mockRead.mockResolvedValue({ resource: { ...APPLICATION_WITH_FILES } });
    mockReplace.mockResolvedValue({});
    mockDeleteBlob.mockResolvedValue({ succeeded: true });
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

      const req = buildRequest("abc-123", "resume");
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

      const req = buildRequest("abc-123", "resume");
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
    it("should return 400 when fileType is an invalid enum value", async () => {
      const req = buildRequest("abc-123", "transcript");
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

      const req = buildRequest("nonexistent-id", "resume");
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });

    it("should return 404 when application is soft-deleted", async () => {
      mockRead.mockResolvedValue({ resource: DELETED_APPLICATION });

      const req = buildRequest("del-789", "resume");
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });

    it("should return 404 when no file of requested type exists on the application", async () => {
      mockRead.mockResolvedValue({ resource: APPLICATION_NO_FILES });

      const req = buildRequest("no-files-456", "resume");
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
      expect((body.error as Record<string, string>).message).toContain(
        "resume",
      );
    });

    it("should return 404 when coverLetter file is null", async () => {
      mockRead.mockResolvedValue({ resource: APPLICATION_NO_FILES });

      const req = buildRequest("no-files-456", "coverLetter");
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });

    it("should return 404 when jobDescription file is null", async () => {
      mockRead.mockResolvedValue({ resource: APPLICATION_NO_FILES });

      const req = buildRequest("no-files-456", "jobDescription");
      const res = await handler(req, createContext());

      expect(res.status).toBe(404);
      const body = parseBody(res);
      expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // =========================================================================
  // HAPPY PATH
  // =========================================================================
  describe("happy path", () => {
    it("should return 200 and delete resume blob + null Cosmos field", async () => {
      const req = buildRequest("abc-123", "resume");
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();
      expect(body.data).toEqual({
        id: "abc-123",
        fileType: "resume",
        deleted: true,
      });

      // Verify blob was deleted from correct container/path
      expect(mockGetContainerClient).toHaveBeenCalledWith("resumes");
      expect(mockGetBlockBlobClient).toHaveBeenCalledWith(
        "abc-123/1710498900000-my-resume.pdf",
      );
      expect(mockDeleteBlob).toHaveBeenCalledTimes(1);

      // Verify Cosmos was updated — resume field set to null
      expect(mockReplace).toHaveBeenCalledTimes(1);
      const replacedDoc = mockReplace.mock.calls[0][0];
      expect(replacedDoc.resume).toBeNull();
      // Other file fields should be unchanged
      expect(replacedDoc.coverLetter).toEqual(
        APPLICATION_WITH_FILES.coverLetter,
      );
      expect(replacedDoc.jobDescriptionFile).toEqual(
        APPLICATION_WITH_FILES.jobDescriptionFile,
      );
    });

    it("should return 200 and delete coverLetter blob + null Cosmos field", async () => {
      const req = buildRequest("abc-123", "coverLetter");
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();
      expect(body.data).toEqual({
        id: "abc-123",
        fileType: "coverLetter",
        deleted: true,
      });

      expect(mockGetContainerClient).toHaveBeenCalledWith("coverletters");
      expect(mockGetBlockBlobClient).toHaveBeenCalledWith(
        "abc-123/1710498905000-cover-letter.docx",
      );
      expect(mockDeleteBlob).toHaveBeenCalledTimes(1);

      const replacedDoc = mockReplace.mock.calls[0][0];
      expect(replacedDoc.coverLetter).toBeNull();
      expect(replacedDoc.resume).toEqual(APPLICATION_WITH_FILES.resume);
    });

    it("should return 200 and delete jobDescription blob + null Cosmos field", async () => {
      const req = buildRequest("abc-123", "jobDescription");
      const res = await handler(req, createContext());

      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.error).toBeNull();
      expect(body.data).toEqual({
        id: "abc-123",
        fileType: "jobDescription",
        deleted: true,
      });

      expect(mockGetContainerClient).toHaveBeenCalledWith("jobdescriptions");
      expect(mockGetBlockBlobClient).toHaveBeenCalledWith(
        "abc-123/1710498910000-job-desc.html",
      );
      expect(mockDeleteBlob).toHaveBeenCalledTimes(1);

      const replacedDoc = mockReplace.mock.calls[0][0];
      expect(replacedDoc.jobDescriptionFile).toBeNull();
    });

    it("should update updatedAt timestamp on the Cosmos document", async () => {
      const req = buildRequest("abc-123", "resume");
      await handler(req, createContext());

      const replacedDoc = mockReplace.mock.calls[0][0];
      expect(replacedDoc.updatedAt).toBeDefined();
      // updatedAt should be newer than the original
      expect(new Date(replacedDoc.updatedAt).getTime()).toBeGreaterThan(
        new Date(APPLICATION_WITH_FILES.updatedAt).getTime(),
      );
    });

    it("should update Cosmos before deleting blob (consistency)", async () => {
      // Track call order
      const callOrder: string[] = [];
      mockReplace.mockImplementation(() => {
        callOrder.push("cosmosReplace");
        return Promise.resolve({});
      });
      mockDeleteBlob.mockImplementation(() => {
        callOrder.push("blobDelete");
        return Promise.resolve({ succeeded: true });
      });

      const req = buildRequest("abc-123", "resume");
      await handler(req, createContext());

      expect(callOrder).toEqual(["cosmosReplace", "blobDelete"]);
    });
  });

  // =========================================================================
  // ERROR HANDLING
  // =========================================================================
  describe("error handling", () => {
    it("should return 500 on unexpected Cosmos error", async () => {
      mockRead.mockRejectedValue(new Error("Cosmos connection failed"));

      const req = buildRequest("abc-123", "resume");
      const res = await handler(req, createContext());

      expect(res.status).toBe(500);
      const body = parseBody(res);
      expect(body.data).toBeNull();
      expect(body.error).toMatchObject({ code: "INTERNAL_ERROR" });
    });

    it("should still return 200 if blob delete fails (orphan caught by lifecycle)", async () => {
      mockDeleteBlob.mockRejectedValue(new Error("Blob not found"));

      const req = buildRequest("abc-123", "resume");
      const res = await handler(req, createContext());

      // Cosmos was updated (file field nulled), blob delete failure is non-fatal
      expect(res.status).toBe(200);
      const body = parseBody(res);
      expect(body.data).toEqual({
        id: "abc-123",
        fileType: "resume",
        deleted: true,
      });
    });
  });
});
