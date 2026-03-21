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
  stripBlobUrl,
} from "../../shared/response.js";
import { Application } from "../../shared/types.js";

async function restoreApplication(
  req: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  // 1. Auth check
  const authError = requireOwner(req);
  if (authError) return authError;

  try {
    const id = req.params.id;

    // 2. Point read
    const container = getContainer();
    const { resource } = await container.item(id, id).read<Application>();

    // 3. Not found or not soft-deleted (can only restore deleted apps)
    if (!resource || !resource.isDeleted) {
      return notFoundError(`Application ${id} not found`);
    }

    // 4. Restore
    const now = new Date().toISOString();
    const updated = {
      ...resource,
      isDeleted: false,
      deletedAt: null,
      updatedAt: now,
    };

    const { resource: restored } = await container
      .item(id, id)
      .replace(updated);

    // 5. Strip blobUrl from file fields
    const application = {
      ...restored,
      resume: stripBlobUrl(restored!.resume),
      coverLetter: stripBlobUrl(restored!.coverLetter),
      jobDescriptionFile: stripBlobUrl(restored!.jobDescriptionFile),
    };

    return successResponse(application);
  } catch {
    return serverError();
  }
}

app.http("restoreApplication", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "applications/{id}/restore",
  handler: restoreApplication,
});

export default restoreApplication;
