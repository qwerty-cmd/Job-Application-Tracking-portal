import { describe, it, expect, vi, beforeEach } from "vitest";
import { InvocationContext, EventGridEvent } from "@azure/functions";

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

const mockGetProperties = vi.fn();
const mockDownload = vi.fn();
const mockDeleteIfExists = vi.fn();
const mockGetBlockBlobClient = vi.fn(() => ({
  getProperties: mockGetProperties,
  download: mockDownload,
  deleteIfExists: mockDeleteIfExists,
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

function buildEvent(overrides: Partial<EventGridEvent> = {}): EventGridEvent {
  return {
    id: "event-1",
    eventType: "Microsoft.Storage.BlobCreated",
    subject:
      "/blobServices/default/containers/resumes/blobs/abc-123/1710498900000-my-resume.pdf",
    data: {
      api: "PutBlob",
      url: "https://stjobtrackermliokt.blob.core.windows.net/resumes/abc-123/1710498900000-my-resume.pdf",
      contentLength: 1024,
    },
    dataVersion: "1",
    metadataVersion: "1",
    eventTime: "2026-03-15T10:30:00Z",
    topic:
      "/subscriptions/sub-id/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/stjobtrackermliokt",
    ...overrides,
  } as EventGridEvent;
}

function createContext(): InvocationContext {
  return new InvocationContext({ functionName: "processUpload" });
}

function createReadableStream(content: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APPLICATION = {
  id: "abc-123",
  company: "Contoso Ltd",
  role: "Senior Cloud Engineer",
  isDeleted: false,
  deletedAt: null,
  resume: null,
  coverLetter: null,
  jobDescriptionFile: null,
  interviews: [],
  createdAt: "2026-03-15T10:00:00Z",
  updatedAt: "2026-03-15T10:00:00Z",
};

const APPLICATION_WITH_RESUME = {
  ...APPLICATION,
  resume: {
    blobUrl:
      "https://stjobtrackermliokt.blob.core.windows.net/resumes/abc-123/1710498800000-old-resume.pdf",
    fileName: "old-resume.pdf",
    uploadedAt: "2024-03-14T10:00:00Z",
  },
};

const DELETED_APPLICATION = {
  ...APPLICATION,
  isDeleted: true,
  deletedAt: "2026-03-15T09:00:00Z",
};

// ---------------------------------------------------------------------------
// Import handler
// ---------------------------------------------------------------------------
import handler from "./index.ts";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRead.mockResolvedValue({ resource: { ...APPLICATION } });
    mockReplace.mockResolvedValue({});
    mockGetProperties.mockResolvedValue({ contentLength: 1024 });
    mockDownload.mockResolvedValue({
      readableStreamBody: createReadableStream("%PDF-1.4 fake pdf content"),
    });
    mockDeleteIfExists.mockResolvedValue({ succeeded: true });
  });

  // =========================================================================
  // CONTAINER FILTERING
  // =========================================================================
  describe("container filtering", () => {
    it("should skip events from non-upload containers (e.g. deadletter)", async () => {
      const event = buildEvent({
        subject:
          "/blobServices/default/containers/deadletter/blobs/some-file.json",
        data: {
          url: "https://stjobtrackermliokt.blob.core.windows.net/deadletter/some-file.json",
        },
      });

      await handler(event, createContext());

      expect(mockRead).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("should process events from resumes container", async () => {
      const event = buildEvent();
      await handler(event, createContext());

      expect(mockRead).toHaveBeenCalled();
    });

    it("should process events from coverletters container", async () => {
      const event = buildEvent({
        subject:
          "/blobServices/default/containers/coverletters/blobs/abc-123/1710498900000-cover.docx",
        data: {
          url: "https://stjobtrackermliokt.blob.core.windows.net/coverletters/abc-123/1710498900000-cover.docx",
        },
      });

      // DOCX magic bytes (PK / ZIP signature)
      mockDownload.mockResolvedValue({
        readableStreamBody: createReadableStream("PK\x03\x04 fake docx"),
      });

      await handler(event, createContext());
      expect(mockRead).toHaveBeenCalled();
    });

    it("should process events from jobdescriptions container", async () => {
      const event = buildEvent({
        subject:
          "/blobServices/default/containers/jobdescriptions/blobs/abc-123/1710498900000-jd.html",
        data: {
          url: "https://stjobtrackermliokt.blob.core.windows.net/jobdescriptions/abc-123/1710498900000-jd.html",
        },
      });

      mockDownload.mockResolvedValue({
        readableStreamBody: createReadableStream(
          "<!DOCTYPE html><html><body>JD</body></html>",
        ),
      });

      await handler(event, createContext());
      expect(mockRead).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // FILE SIZE VALIDATION
  // =========================================================================
  describe("file size validation", () => {
    it("should delete blob and skip Cosmos update if file exceeds 10 MB", async () => {
      mockGetProperties.mockResolvedValue({
        contentLength: 10485761, // 10 MB + 1 byte
      });

      const event = buildEvent();
      await handler(event, createContext());

      expect(mockDeleteIfExists).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("should process normally if file is exactly 10 MB", async () => {
      mockGetProperties.mockResolvedValue({
        contentLength: 10485760, // exactly 10 MB
      });

      const event = buildEvent();
      await handler(event, createContext());

      expect(mockReplace).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // CONTENT VALIDATION (magic bytes)
  // =========================================================================
  describe("content validation", () => {
    it("should accept PDF files starting with %PDF", async () => {
      mockDownload.mockResolvedValue({
        readableStreamBody: createReadableStream("%PDF-1.7 content"),
      });

      const event = buildEvent();
      await handler(event, createContext());

      expect(mockReplace).toHaveBeenCalled();
    });

    it("should accept DOCX files starting with PK (ZIP signature)", async () => {
      const event = buildEvent({
        subject:
          "/blobServices/default/containers/coverletters/blobs/abc-123/1710498900000-cover.docx",
        data: {
          url: "https://stjobtrackermliokt.blob.core.windows.net/coverletters/abc-123/1710498900000-cover.docx",
        },
      });

      mockDownload.mockResolvedValue({
        readableStreamBody: createReadableStream("PK\x03\x04 docx content"),
      });

      await handler(event, createContext());
      expect(mockReplace).toHaveBeenCalled();
    });

    it("should accept HTML files starting with <!DOCTYPE", async () => {
      const event = buildEvent({
        subject:
          "/blobServices/default/containers/jobdescriptions/blobs/abc-123/1710498900000-jd.html",
        data: {
          url: "https://stjobtrackermliokt.blob.core.windows.net/jobdescriptions/abc-123/1710498900000-jd.html",
        },
      });

      mockDownload.mockResolvedValue({
        readableStreamBody: createReadableStream(
          "<!DOCTYPE html><html></html>",
        ),
      });

      await handler(event, createContext());
      expect(mockReplace).toHaveBeenCalled();
    });

    it("should accept HTML files starting with <html (case-insensitive)", async () => {
      const event = buildEvent({
        subject:
          "/blobServices/default/containers/jobdescriptions/blobs/abc-123/1710498900000-jd.html",
        data: {
          url: "https://stjobtrackermliokt.blob.core.windows.net/jobdescriptions/abc-123/1710498900000-jd.html",
        },
      });

      mockDownload.mockResolvedValue({
        readableStreamBody: createReadableStream(
          "<HTML><body>content</body></HTML>",
        ),
      });

      await handler(event, createContext());
      expect(mockReplace).toHaveBeenCalled();
    });

    it("should delete blob and skip Cosmos update if content does not match extension (PDF)", async () => {
      mockDownload.mockResolvedValue({
        readableStreamBody: createReadableStream(
          "This is not a PDF file at all",
        ),
      });

      const event = buildEvent(); // .pdf file
      await handler(event, createContext());

      expect(mockDeleteIfExists).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("should delete blob and skip Cosmos update if content does not match extension (DOCX)", async () => {
      const event = buildEvent({
        subject:
          "/blobServices/default/containers/coverletters/blobs/abc-123/1710498900000-cover.docx",
        data: {
          url: "https://stjobtrackermliokt.blob.core.windows.net/coverletters/abc-123/1710498900000-cover.docx",
        },
      });

      mockDownload.mockResolvedValue({
        readableStreamBody: createReadableStream("Not a zip/docx file"),
      });

      await handler(event, createContext());

      expect(mockDeleteIfExists).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // SOFT-DELETED APPLICATION
  // =========================================================================
  describe("soft-deleted application", () => {
    it("should skip processing if application is soft-deleted", async () => {
      mockRead.mockResolvedValue({ resource: DELETED_APPLICATION });

      const event = buildEvent();
      await handler(event, createContext());

      // Should not update Cosmos, should not delete the blob (lifecycle handles it)
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("should skip processing if application does not exist", async () => {
      mockRead.mockResolvedValue({ resource: undefined });

      const event = buildEvent();
      await handler(event, createContext());

      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // LATEST WINS (race condition handling)
  // =========================================================================
  describe("latest wins", () => {
    it("should update Cosmos when no previous file exists", async () => {
      mockRead.mockResolvedValue({ resource: { ...APPLICATION } });

      const event = buildEvent();
      await handler(event, createContext());

      expect(mockReplace).toHaveBeenCalledTimes(1);
      const doc = mockReplace.mock.calls[0][0];
      expect(doc.resume).toBeDefined();
      expect(doc.resume.fileName).toBe("my-resume.pdf");
      expect(doc.resume.blobUrl).toContain("resumes/abc-123/1710498900000");
    });

    it("should update Cosmos when new upload is newer than existing", async () => {
      // Existing file uploaded at 2026-03-14
      mockRead.mockResolvedValue({
        resource: { ...APPLICATION_WITH_RESUME },
      });

      // New upload has timestamp 1710498900000 which is newer
      const event = buildEvent();
      await handler(event, createContext());

      expect(mockReplace).toHaveBeenCalledTimes(1);
      const doc = mockReplace.mock.calls[0][0];
      expect(doc.resume.fileName).toBe("my-resume.pdf");
    });

    it("should skip update when new upload is older than existing", async () => {
      // Existing file has a very recent uploadedAt
      const appWithNewerFile = {
        ...APPLICATION,
        resume: {
          blobUrl:
            "https://stjobtrackermliokt.blob.core.windows.net/resumes/abc-123/9999999999999-newer-resume.pdf",
          fileName: "newer-resume.pdf",
          uploadedAt: "2099-01-01T00:00:00Z",
        },
      };
      mockRead.mockResolvedValue({ resource: appWithNewerFile });

      // Event blob has older timestamp (1710498900000)
      const event = buildEvent();
      await handler(event, createContext());

      // Should NOT update Cosmos — existing is newer
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("should delete old blob when replacing with newer upload", async () => {
      mockRead.mockResolvedValue({
        resource: { ...APPLICATION_WITH_RESUME },
      });

      const event = buildEvent();
      await handler(event, createContext());

      // Should delete the old blob
      expect(mockGetContainerClient).toHaveBeenCalledWith("resumes");
      // deleteIfExists called for old blob
      expect(mockDeleteIfExists).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // HAPPY PATH — Cosmos update
  // =========================================================================
  describe("happy path", () => {
    it("should update Cosmos with correct file metadata for resume", async () => {
      const event = buildEvent();
      await handler(event, createContext());

      expect(mockReplace).toHaveBeenCalledTimes(1);
      const doc = mockReplace.mock.calls[0][0];
      expect(doc.resume).toMatchObject({
        blobUrl: expect.stringContaining("resumes/abc-123/1710498900000"),
        fileName: "my-resume.pdf",
        uploadedAt: expect.any(String),
      });
      expect(doc.updatedAt).toBeDefined();
    });

    it("should update Cosmos with correct file metadata for coverLetter", async () => {
      const event = buildEvent({
        subject:
          "/blobServices/default/containers/coverletters/blobs/abc-123/1710498900000-cover.docx",
        data: {
          url: "https://stjobtrackermliokt.blob.core.windows.net/coverletters/abc-123/1710498900000-cover.docx",
        },
      });

      mockDownload.mockResolvedValue({
        readableStreamBody: createReadableStream("PK\x03\x04 docx content"),
      });

      await handler(event, createContext());

      const doc = mockReplace.mock.calls[0][0];
      expect(doc.coverLetter).toMatchObject({
        blobUrl: expect.stringContaining("coverletters/abc-123/1710498900000"),
        fileName: "cover.docx",
      });
    });

    it("should update Cosmos with correct file metadata for jobDescription", async () => {
      const event = buildEvent({
        subject:
          "/blobServices/default/containers/jobdescriptions/blobs/abc-123/1710498900000-jd.html",
        data: {
          url: "https://stjobtrackermliokt.blob.core.windows.net/jobdescriptions/abc-123/1710498900000-jd.html",
        },
      });

      mockDownload.mockResolvedValue({
        readableStreamBody: createReadableStream(
          "<!DOCTYPE html><html></html>",
        ),
      });

      await handler(event, createContext());

      const doc = mockReplace.mock.calls[0][0];
      expect(doc.jobDescriptionFile).toMatchObject({
        blobUrl: expect.stringContaining(
          "jobdescriptions/abc-123/1710498900000",
        ),
        fileName: "jd.html",
      });
    });

    it("should update updatedAt on the Cosmos document", async () => {
      const event = buildEvent();
      await handler(event, createContext());

      const doc = mockReplace.mock.calls[0][0];
      expect(new Date(doc.updatedAt).getTime()).toBeGreaterThan(
        new Date(APPLICATION.updatedAt).getTime(),
      );
    });
  });

  // =========================================================================
  // IDEMPOTENCY
  // =========================================================================
  describe("idempotency", () => {
    it("should treat blob-not-found on old blob deletion as success", async () => {
      mockRead.mockResolvedValue({
        resource: { ...APPLICATION_WITH_RESUME },
      });

      // Mock deleteIfExists to return succeeded: false (blob already gone)
      // The first deleteIfExists call may be for old blob, subsequent for new
      mockDeleteIfExists.mockResolvedValue({ succeeded: false });

      const event = buildEvent();
      // Should not throw
      await handler(event, createContext());

      expect(mockReplace).toHaveBeenCalled();
    });

    it("should not throw when old blob delete throws an error", async () => {
      mockRead.mockResolvedValue({
        resource: { ...APPLICATION_WITH_RESUME },
      });

      // deleteIfExists throws (simulating transient failure on old blob delete)
      mockDeleteIfExists.mockRejectedValue(new Error("Blob not found"));

      const event = buildEvent();
      await handler(event, createContext());

      // Should still update Cosmos
      expect(mockReplace).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // ERROR HANDLING
  // =========================================================================
  describe("error handling", () => {
    it("should throw on unexpected Cosmos error (for Event Grid retry)", async () => {
      mockRead.mockRejectedValue(new Error("Cosmos connection failed"));

      const event = buildEvent();

      await expect(handler(event, createContext())).rejects.toThrow(
        "Cosmos connection failed",
      );
    });
  });
});
