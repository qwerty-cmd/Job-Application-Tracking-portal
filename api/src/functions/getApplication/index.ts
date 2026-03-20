import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { requireOwner } from "../../shared/auth.js";
import { getContainer } from "../../shared/cosmosClient.js";
import {
  successResponse,
  notFoundError,
  serverError,
} from "../../shared/response.js";
import { Application } from "../../shared/types.js";

function stripBlobUrl(
  file: Application["resume"],
): Omit<NonNullable<Application["resume"]>, "blobUrl"> | null {
  if (!file) return null;
  const { blobUrl, ...rest } = file;
  return rest;
}

async function getApplication(
  req: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  // 1. Auth check
  const authError = requireOwner(req);
  if (authError) return authError;

  try {
    // 2. Get ID from route params
    const id = req.params.id;

    // 3. Point read from Cosmos (partition key is /id)
    const { resource } = await getContainer().item(id, id).read<Application>();

    // 4. Not found
    if (!resource) {
      return notFoundError(`Application ${id} not found`);
    }

    // 5. Soft-deleted
    if (resource.isDeleted) {
      return notFoundError(`Application ${id} not found`);
    }

    // 6. Strip blobUrl from file fields
    const application = {
      ...resource,
      resume: stripBlobUrl(resource.resume),
      coverLetter: stripBlobUrl(resource.coverLetter),
      jobDescriptionFile: stripBlobUrl(resource.jobDescriptionFile),
    };

    // 7. Return success
    return successResponse(application);
  } catch {
    return serverError();
  }
}

app.http("getApplication", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "applications/{id}",
  handler: getApplication,
});

export default getApplication;
