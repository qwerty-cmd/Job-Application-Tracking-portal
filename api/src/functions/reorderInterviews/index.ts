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
  validationError,
} from "../../shared/response.js";
import { Application } from "../../shared/types.js";

function stripBlobUrl(
  file: Application["resume"],
): Omit<NonNullable<Application["resume"]>, "blobUrl"> | null {
  if (!file) return null;
  const { blobUrl, ...rest } = file;
  return rest;
}

async function reorderInterviews(
  req: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  // 1. Auth check
  const authError = requireOwner(req);
  if (authError) return authError;

  try {
    const id = req.params.id;

    // 2. Parse request body
    const body = (await req.json()) as Record<string, unknown>;

    // 3. Validate order array
    if (!body.order || !Array.isArray(body.order)) {
      return validationError([
        { field: "order", message: "Must be an array of interview IDs" },
      ]);
    }

    const orderIds = body.order as string[];

    if (orderIds.length === 0) {
      return validationError([
        { field: "order", message: "Must not be empty" },
      ]);
    }

    // 4. Point read application
    const container = getContainer();
    const { resource } = await container.item(id, id).read<Application>();

    if (!resource || resource.isDeleted) {
      return notFoundError(`Application ${id} not found`);
    }

    // 5. Validate: all IDs must exist, no extras, no duplicates
    const existingIds = new Set(resource.interviews.map((i) => i.id));
    const providedIds = new Set(orderIds);

    if (providedIds.size !== orderIds.length) {
      return validationError([
        { field: "order", message: "Duplicate interview IDs" },
      ]);
    }

    if (orderIds.length !== existingIds.size) {
      return validationError([
        {
          field: "order",
          message: "Must contain all interview IDs (no partial reorder)",
        },
      ]);
    }

    for (const oid of orderIds) {
      if (!existingIds.has(oid)) {
        return validationError([
          {
            field: "order",
            message: `Interview ID ${oid} not found on this application`,
          },
        ]);
      }
    }

    // 6. Update order fields
    const interviewMap = new Map(resource.interviews.map((i) => [i.id, i]));
    const reordered = orderIds.map((oid, index) => ({
      ...interviewMap.get(oid)!,
      order: index + 1,
    }));

    // 7. Update application
    const now = new Date().toISOString();
    const updated = {
      ...resource,
      interviews: reordered,
      updatedAt: now,
    };

    const { resource: saved } = await container.item(id, id).replace(updated);

    // 8. Strip blobUrl and return
    const application = {
      ...saved,
      resume: stripBlobUrl(saved!.resume),
      coverLetter: stripBlobUrl(saved!.coverLetter),
      jobDescriptionFile: stripBlobUrl(saved!.jobDescriptionFile),
    };

    return successResponse(application);
  } catch {
    return serverError();
  }
}

app.http("reorderInterviews", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "applications/{id}/interviews/reorder",
  handler: reorderInterviews,
});

export default reorderInterviews;
