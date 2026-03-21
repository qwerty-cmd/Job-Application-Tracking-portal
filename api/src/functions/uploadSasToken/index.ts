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
import { validateSasTokenRequest } from "../../shared/validation.js";
import {
  successResponse,
  errorResponse,
  validationError,
  notFoundError,
  serverError,
} from "../../shared/response.js";
import {
  Application,
  FileType,
  FILE_TYPE_CONTAINERS,
} from "../../shared/types.js";

async function uploadSasToken(
  req: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  // 1. Auth check
  const authError = requireOwner(req);
  if (authError) return authError;

  try {
    // 2. Parse body
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return errorResponse(
        400,
        "INVALID_BODY",
        "Request body must be valid JSON",
      );
    }

    // 3. Validate
    const errors = validateSasTokenRequest(body);
    if (errors.length > 0) return validationError(errors);

    const applicationId = body.applicationId as string;
    const fileType = body.fileType as FileType;
    const fileName = body.fileName as string;

    // 4. Verify application exists and is not soft-deleted
    const container = getContainer();
    const { resource } = await container
      .item(applicationId, applicationId)
      .read<Application>();

    if (!resource || resource.isDeleted) {
      return notFoundError(`Application ${applicationId} not found`);
    }

    // 5. Generate SAS URL
    const containerName = FILE_TYPE_CONTAINERS[fileType];
    const timestamp = Date.now();
    const blobName = `${applicationId}/${timestamp}-${fileName}`;
    const blobPath = `${containerName}/${blobName}`;

    const blobServiceClient = getBlobServiceClient();
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const expiresOn = new Date(Date.now() + 5 * 60 * 1000);
    const uploadUrl = await blockBlobClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("cw"),
      expiresOn,
    });

    // 6. Return 200
    return successResponse({
      uploadUrl,
      blobPath,
      expiresAt: expiresOn.toISOString(),
    });
  } catch {
    return serverError();
  }
}

app.http("uploadSasToken", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "upload/sas-token",
  handler: uploadSasToken,
});

export default uploadSasToken;
