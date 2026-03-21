import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { randomUUID } from "crypto";
import { requireOwner } from "../../shared/auth.js";
import { getContainer } from "../../shared/cosmosClient.js";
import {
  successResponse,
  errorResponse,
  notFoundError,
  serverError,
  validationError,
  stripBlobUrl,
} from "../../shared/response.js";
import { Application, STATUS_ORDER } from "../../shared/types.js";
import { validateCreateInterview } from "../../shared/validation.js";

async function addInterview(
  req: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  // 1. Auth check
  const authError = requireOwner(req);
  if (authError) return authError;

  try {
    const id = req.params.id;

    // 2. Parse request body
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
    const errors = validateCreateInterview(body);
    if (errors.length > 0) return validationError(errors);

    // 4. Point read application
    const container = getContainer();
    const { resource } = await container.item(id, id).read<Application>();

    if (!resource || resource.isDeleted) {
      return notFoundError(`Application ${id} not found`);
    }

    // 5. Build new interview
    const nextRound = resource.interviews.length + 1;
    const newInterview = {
      id: randomUUID(),
      round: nextRound,
      order: nextRound,
      type: body.type as string,
      date: body.date as string,
      interviewers: (body.interviewers as string) ?? "",
      notes: (body.notes as string) ?? "",
      reflection: (body.reflection as string) ?? "",
      outcome: body.outcome as string,
    };

    // 6. Auto-update status to "Interview Stage" if before it
    const currentStatusOrder = STATUS_ORDER[resource.status];
    const interviewStageOrder = STATUS_ORDER["Interview Stage"];
    const newStatus =
      currentStatusOrder < interviewStageOrder
        ? "Interview Stage"
        : resource.status;

    // 7. Update application
    const now = new Date().toISOString();
    const updated = {
      ...resource,
      status: newStatus,
      interviews: [...resource.interviews, newInterview],
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

    return successResponse(application, 201);
  } catch {
    return serverError();
  }
}

app.http("addInterview", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "applications/{id}/interviews",
  handler: addInterview,
});

export default addInterview;
