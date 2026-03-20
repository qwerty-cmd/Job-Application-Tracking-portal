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
  validationError,
  serverError,
} from "../../shared/response.js";
import { Application } from "../../shared/types.js";
import { validateUpdateApplication } from "../../shared/validation.js";

function stripBlobUrl(
  file: Application["resume"],
): Omit<NonNullable<Application["resume"]>, "blobUrl"> | null {
  if (!file) return null;
  const { blobUrl, ...rest } = file;
  return rest;
}

async function updateApplication(
  req: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  const authError = requireOwner(req);
  if (authError) return authError;

  try {
    const id = req.params.id;
    const { resource } = await getContainer().item(id, id).read<Application>();

    if (!resource || resource.isDeleted) {
      return notFoundError(`Application ${id} not found`);
    }

    const body = (await req.json()) as Record<string, unknown>;

    // Business rule: if setting status to Rejected and body doesn't include
    // rejection.reason, but the existing record already has one, carry it forward
    // so validation passes (validateUpdateApplication requires rejection.reason
    // in the body when status is Rejected)
    if (
      body.status === "Rejected" &&
      !(body.rejection as Record<string, unknown> | undefined)?.reason &&
      resource.rejection?.reason
    ) {
      body.rejection = {
        reason: resource.rejection.reason,
        notes: resource.rejection.notes,
      };
    }

    const errors = validateUpdateApplication(body);
    if (errors.length > 0) {
      return validationError(errors);
    }

    const merged = {
      ...resource,
      ...body,
      updatedAt: new Date().toISOString(),
    };

    await getContainer().item(id, id).replace(merged);

    const response = {
      ...merged,
      resume: stripBlobUrl(merged.resume as Application["resume"]),
      coverLetter: stripBlobUrl(merged.coverLetter as Application["resume"]),
      jobDescriptionFile: stripBlobUrl(
        merged.jobDescriptionFile as Application["resume"],
      ),
    };

    return successResponse(response);
  } catch {
    return serverError();
  }
}

app.http("updateApplication", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "applications/{id}",
  handler: updateApplication,
});

export default updateApplication;
