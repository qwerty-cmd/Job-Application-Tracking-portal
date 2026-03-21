import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { BlobSASPermissions } from "@azure/storage-blob";
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

async function downloadSasToken(
  req: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  // 1. Auth check
  const authError = requireOwner(req);
  if (authError) return authError;

  try {
    // 2. Validate query params
    const applicationId = req.query.get("applicationId");
    const fileType = req.query.get("fileType");

    const errors: Array<{ field: string; message: string }> = [];
    if (!applicationId) {
      errors.push({ field: "applicationId", message: "Required field" });
    }
    if (!fileType) {
      errors.push({ field: "fileType", message: "Required field" });
    } else if (!VALID_FILE_TYPES_SET.has(fileType)) {
      errors.push({
        field: "fileType",
        message: "Must be one of: resume, coverLetter, jobDescription",
      });
    }
    if (errors.length > 0) return validationError(errors);

    const validatedFileType = fileType as FileType;

    // 3. Look up application in Cosmos
    const container = getContainer();
    const { resource } = await container
      .item(applicationId!, applicationId!)
      .read<Application>();

    if (!resource || resource.isDeleted) {
      return notFoundError(`Application ${applicationId} not found`);
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
        `No ${validatedFileType} found for application ${applicationId}`,
      );
    }

    // 5. Parse blobUrl to extract container name and blob path
    const blobUrl = new URL(fileMeta.blobUrl);
    const pathParts = blobUrl.pathname.split("/").filter(Boolean);
    const containerName = pathParts[0];
    const blobName = pathParts.slice(1).join("/");

    // 6. Generate read-only SAS URL with 5-minute expiry
    const blobServiceClient = getBlobServiceClient();
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const expiresOn = new Date(Date.now() + 5 * 60 * 1000);
    const downloadUrl = await blockBlobClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn,
    });

    // 7. Return response
    return successResponse({
      downloadUrl,
      fileName: fileMeta.fileName,
      expiresAt: expiresOn.toISOString(),
    });
  } catch {
    return serverError();
  }
}

app.http("downloadSasToken", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "download/sas-token",
  handler: downloadSasToken,
});

export default downloadSasToken;
