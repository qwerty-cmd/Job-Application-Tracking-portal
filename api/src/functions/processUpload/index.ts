import { app, EventGridEvent, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import { getContainer } from "../../shared/cosmosClient.js";
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
  // 1. Parse blob path from event subject
  const parsed = parseBlobPath(event.subject);
  if (!parsed) {
    context.log(`Skipping event — unable to parse subject: ${event.subject}`);
    return;
  }

  const { containerName, blobName, applicationId, timestamp, fileName } =
    parsed;

  // 2. Filter to valid upload containers only
  if (!VALID_CONTAINERS.has(containerName)) {
    context.log(
      `Skipping event — container "${containerName}" is not an upload container`,
    );
    return;
  }

  const fileType = CONTAINER_TO_FILE_TYPE[containerName];
  const fieldName = FILE_TYPE_TO_FIELD[fileType];
  const blobServiceClient = getBlobServiceClient();

  // 3. Check blob size (defence in depth — SAS already limits to 10 MB)
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const properties = await blockBlobClient.getProperties();

  if (properties.contentLength && properties.contentLength > MAX_FILE_SIZE) {
    context.log(
      `Deleting oversized blob: ${containerName}/${blobName} (${properties.contentLength} bytes)`,
    );
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
      context.log(`Content mismatch for ${fileName} — deleting blob`);
      await blockBlobClient.deleteIfExists();
      return;
    }
  }

  // 5. Read application from Cosmos
  const cosmosContainer = getContainer();
  const { resource } = await cosmosContainer
    .item(applicationId, applicationId)
    .read<Application>();

  // 6. Skip if application doesn't exist or is soft-deleted
  if (!resource) {
    context.log(`Application ${applicationId} not found — skipping`);
    return;
  }
  if (resource.isDeleted) {
    context.log(`Application ${applicationId} is soft-deleted — skipping`);
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
      context.log(`Skipping older upload (${timestamp} <= ${existingTime})`);
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
    updatedAt: now,
  };

  await cosmosContainer.item(applicationId, applicationId).replace(updated);

  // 9. Delete old blob (non-fatal — lifecycle policy is the safety net)
  if (existingFile) {
    try {
      const oldUrl = new URL(existingFile.blobUrl);
      const oldPathParts = oldUrl.pathname.split("/").filter(Boolean);
      const oldContainerName = oldPathParts[0];
      const oldBlobName = oldPathParts.slice(1).join("/");

      const oldContainerClient =
        blobServiceClient.getContainerClient(oldContainerName);
      const oldBlobClient = oldContainerClient.getBlockBlobClient(oldBlobName);
      await oldBlobClient.deleteIfExists();
    } catch {
      // "blob not found" on old blob deletion is treated as success (idempotency)
      context.log(`Non-fatal: failed to delete old blob for ${applicationId}`);
    }
  }
}

app.eventGrid("processUpload", {
  handler: processUpload,
});

export default processUpload;
