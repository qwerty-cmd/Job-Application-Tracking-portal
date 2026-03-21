import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { requireOwner } from "../../shared/auth.js";
import { getContainer } from "../../shared/cosmosClient.js";
import { getBlobServiceClient } from "../../shared/storageClient.js";
import {
  successResponse,
  validationError,
  notFoundError,
  serverError,
} from "../../shared/response.js";
import {
  Application,
  FileType,
  FILE_TYPE_TO_FIELD,
  VALID_FILE_TYPES_SET,
} from "../../shared/types.js";

async function deleteFile(
  req: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  // 1. Auth check
  const authError = requireOwner(req);
  if (authError) return authError;

  try {
    const id = req.params.id;
    const fileType = req.params.fileType;

    // 2. Validate fileType
    if (!VALID_FILE_TYPES_SET.has(fileType)) {
      return validationError([
        {
          field: "fileType",
          message: "Must be one of: resume, coverLetter, jobDescription",
        },
      ]);
    }

    const validatedFileType = fileType as FileType;

    // 3. Look up application in Cosmos
    const container = getContainer();
    const { resource } = await container.item(id, id).read<Application>();

    if (!resource || resource.isDeleted) {
      return notFoundError(`Application ${id} not found`);
    }

    // 4. Check if file exists on the application
    const fieldName = FILE_TYPE_TO_FIELD[validatedFileType];
    const fileMeta = resource[fieldName] as {
      blobUrl: string;
      fileName: string;
      uploadedAt: string;
    } | null;

    if (!fileMeta) {
      return notFoundError(
        `No ${validatedFileType} found for application ${id}`,
      );
    }

    // 5. Parse blobUrl to extract container name and blob path
    const blobUrl = new URL(fileMeta.blobUrl);
    const pathParts = blobUrl.pathname.split("/").filter(Boolean);
    const containerName = pathParts[0];
    const blobName = pathParts.slice(1).join("/");

    // 6. Update Cosmos first (null out file field, update timestamp)
    const now = new Date().toISOString();
    const updated = {
      ...resource,
      [fieldName]: null,
      updatedAt: now,
    };
    await container.item(id, id).replace(updated);

    // 7. Delete blob from storage (non-fatal if it fails — lifecycle policy catches orphans)
    try {
      const blobServiceClient = getBlobServiceClient();
      const containerClient =
        blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
    } catch {
      // Blob delete failure is non-fatal — 90-day lifecycle policy is the safety net
    }

    // 8. Return success
    return successResponse({
      id,
      fileType: validatedFileType,
      deleted: true,
    });
  } catch {
    return serverError();
  }
}

app.http("deleteFile", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "applications/{id}/files/{fileType}",
  handler: deleteFile,
});

export default deleteFile;
