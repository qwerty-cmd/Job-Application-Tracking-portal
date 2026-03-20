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

async function deleteApplication(
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

    // 3. Not found or already deleted
    if (!resource || resource.isDeleted) {
      return notFoundError(`Application ${id} not found`);
    }

    // 4. Soft delete
    const now = new Date().toISOString();
    const updated = {
      ...resource,
      isDeleted: true,
      deletedAt: now,
      updatedAt: now,
    };

    await container.item(id, id).replace(updated);

    // 5. Return success
    return successResponse({ id, deleted: true });
  } catch {
    return serverError();
  }
}

app.http("deleteApplication", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "applications/{id}",
  handler: deleteApplication,
});

export default deleteApplication;
