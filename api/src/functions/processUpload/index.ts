import { app, EventGridEvent, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import { getContainer } from "../../shared/cosmosClient.js";
import { createLogger, serializeError } from "../../shared/logger.js";
import { trackEvent, trackMetric } from "../../shared/telemetry.js";
import {
  getBlobServiceClient,
  getStorageAccountName,
} from "../../shared/storageClient.js";
import {
  Application,
  FileType,
  FILE_TYPE_TO_FIELD,
  MAX_FILE_SIZE,
} from "../../shared/types.js";
import { createActivityEvent } from "../../shared/response.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTAINER_TO_FILE_TYPE: Record<string, FileType> = {
  resumes: "resume",
  coverletters: "coverLetter",
  jobdescriptions: "jobDescription",
};

const VALID_CONTAINERS = new Set(Object.keys(CONTAINER_TO_FILE_TYPE));

// Map file extension to expected magic bytes
const EXTENSION_VALIDATORS: Record<string, (header: string) => boolean> = {
  ".pdf": (h) => h.startsWith("%PDF"),
  ".docx": (h) => h.startsWith("PK"),
  ".html": (h) => {
    const lower = h.toLowerCase();
    return lower.startsWith("<!doctype") || lower.startsWith("<html");
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBlobPath(subject: string): {
  containerName: string;
  blobName: string;
  applicationId: string;
  timestamp: number;
  fileName: string;
} | null {
  // subject: /blobServices/default/containers/{container}/blobs/{applicationId}/{timestamp}-{fileName}
  const containerMatch = subject.match(/\/containers\/([^/]+)\/blobs\/(.+)/);
  if (!containerMatch) return null;

  const containerName = containerMatch[1];
  const blobName = containerMatch[2]; // e.g. "abc-123/1710498900000-my-resume.pdf"

  const parts = blobName.split("/");
  if (parts.length < 2) return null;

  const applicationId = parts[0];
  const fileNameWithTimestamp = parts.slice(1).join("/");

  // Extract timestamp and fileName from "1710498900000-my-resume.pdf"
  const dashIndex = fileNameWithTimestamp.indexOf("-");
  if (dashIndex === -1) return null;

  const timestamp = parseInt(fileNameWithTimestamp.substring(0, dashIndex), 10);
  const fileName = fileNameWithTimestamp.substring(dashIndex + 1);

  return { containerName, blobName, applicationId, timestamp, fileName };
}

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.substring(dotIndex).toLowerCase() : "";
}

async function readBlobHeader(
  blobServiceClient: BlobServiceClient,
  containerName: string,
  blobName: string,
): Promise<string> {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  // Download only the first 16 bytes using range download
  const downloadResponse = await blockBlobClient.download(0, 16);
  const stream = downloadResponse.readableStreamBody;
  if (!stream) return "";

  // Use Node.js stream API (Azure SDK returns NodeJS.ReadableStream)
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(Buffer.from(chunk));
    if (Buffer.concat(chunks).length >= 16) break;
  }

  if (chunks.length === 0) return "";
  return Buffer.concat(chunks).subarray(0, 16).toString();
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function processUpload(
  event: EventGridEvent,
  context: InvocationContext,
): Promise<void> {
  const log = createLogger(context);
  const startedAt = Date.now();
  log.info("Event received", {
    eventType: event.eventType,
    subject: event.subject,
  });
  try {
    // 1. Parse blob path from event subject
    const parsed = parseBlobPath(event.subject);
    if (!parsed) {
      log.warn("Unable to parse event subject", { subject: event.subject });
      return;
    }

    const { containerName, blobName, applicationId, timestamp, fileName } =
      parsed;

    // 2. Filter to valid upload containers only
    if (!VALID_CONTAINERS.has(containerName)) {
      log.info("Skipping non-upload container", { containerName });
      return;
    }

    const fileType = CONTAINER_TO_FILE_TYPE[containerName];
    const fieldName = FILE_TYPE_TO_FIELD[fileType];
    const blobServiceClient = getBlobServiceClient();

    // 3. Check blob size (defence in depth — SAS already limits to 10 MB)
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    let properties;
    try {
      properties = await blockBlobClient.getProperties();
    } catch (err: unknown) {
      // Blob may have been deleted (e.g. re-upload overwrote it, lifecycle policy)
      // Event Grid retries can deliver events for blobs that no longer exist
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404) {
        log.info("Blob already deleted — skipping", {
          containerName,
          blobName,
        });
        return;
      }
      throw err;
    }

    if (properties.contentLength && properties.contentLength > MAX_FILE_SIZE) {
      log.warn("Deleting oversized blob", {
        containerName,
        blobName,
        size: properties.contentLength,
      });
      await blockBlobClient.deleteIfExists();
      return;
    }

    // 4. Validate content via magic bytes
    const ext = getFileExtension(fileName);
    const validator = EXTENSION_VALIDATORS[ext];
    if (validator) {
      const header = await readBlobHeader(
        blobServiceClient,
        containerName,
        blobName,
      );
      if (!validator(header)) {
        log.warn("Content mismatch — deleting blob", {
          fileName,
          containerName,
          blobName,
        });
        await blockBlobClient.deleteIfExists();
        return;
      }
    }

    // 5. Read application from Cosmos
    const cosmosContainer = getContainer();
    const { resource, requestCharge } = await cosmosContainer
      .item(applicationId, applicationId)
      .read<Application>();
    log.info("Cosmos read", {
      operation: "read",
      partitionKey: applicationId,
      requestCharge,
      applicationId,
    });
    trackMetric("CosmosRequestCharge", requestCharge ?? 0);

    // 6. Skip if application doesn't exist or is soft-deleted
    if (!resource) {
      log.warn("Application not found — skipping", { applicationId });
      return;
    }
    if (resource.isDeleted) {
      log.info("Application soft-deleted — skipping", { applicationId });
      return;
    }

    // 7. "Latest wins" — skip if existing file is newer
    const existingFile = resource[fieldName] as {
      blobUrl: string;
      fileName: string;
      uploadedAt: string;
    } | null;

    if (existingFile) {
      const existingTime = new Date(existingFile.uploadedAt).getTime();
      if (timestamp <= existingTime) {
        log.info("Skipping older upload", {
          timestamp,
          existingTime,
          applicationId,
        });
        return;
      }
    }

    // 8. Build the blob URL and update Cosmos
    const blobUrl = `https://${getStorageAccountName()}.blob.core.windows.net/${containerName}/${blobName}`;
    const now = new Date().toISOString();
    const updated = {
      ...resource,
      [fieldName]: {
        blobUrl,
        fileName,
        uploadedAt: now,
      },
      history: [
        ...(resource.history ?? []),
        createActivityEvent(
          "file_uploaded",
          `File uploaded: ${fileName} (${fileType})`,
        ),
      ],
      updatedAt: now,
    };

    const replaceStart = Date.now();
    const { requestCharge: replaceRequestCharge } = await cosmosContainer
      .item(applicationId, applicationId)
      .replace(updated);
    log.info("Cosmos replace", {
      operation: "replace",
      partitionKey: applicationId,
      requestCharge: replaceRequestCharge,
      durationMs: Date.now() - replaceStart,
      applicationId,
      fileType,
      fileName,
    });
    trackMetric("CosmosRequestCharge", replaceRequestCharge ?? 0);
    trackEvent("FileUploaded", {
      applicationId,
      fileType,
      fileName,
      contentLength: properties.contentLength,
    });

    // 9. Delete old blob (non-fatal — lifecycle policy is the safety net)
    if (existingFile) {
      try {
        const oldUrl = new URL(existingFile.blobUrl);
        const oldPathParts = oldUrl.pathname.split("/").filter(Boolean);
        const oldContainerName = oldPathParts[0];
        const oldBlobName = oldPathParts.slice(1).join("/");

        const oldContainerClient =
          blobServiceClient.getContainerClient(oldContainerName);
        const oldBlobClient =
          oldContainerClient.getBlockBlobClient(oldBlobName);
        await oldBlobClient.deleteIfExists();
        log.info("Deleted previous blob", {
          oldContainerName,
          oldBlobName,
          applicationId,
          fileType,
        });
      } catch (err) {
        // "blob not found" on old blob deletion is treated as success (idempotency)
        log.warn("Non-fatal: failed to delete old blob", {
          error: serializeError(err),
          applicationId,
        });
      }
    }
    log.info("Event processed", {
      durationMs: Date.now() - startedAt,
      applicationId,
      fileType,
      containerName,
      blobName,
    });
  } catch (err) {
    log.error("Unhandled processUpload error", {
      error: serializeError(err),
      durationMs: Date.now() - startedAt,
      subject: event.subject,
    });
    throw err;
  }
}

app.eventGrid("processUpload", {
  handler: processUpload,
});

export default processUpload;
