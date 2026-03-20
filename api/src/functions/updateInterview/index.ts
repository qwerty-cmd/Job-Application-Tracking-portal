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
import { Application, Interview } from "../../shared/types.js";
import { validateUpdateInterview } from "../../shared/validation.js";

function stripBlobUrl(
  file: Application["resume"],
): Omit<NonNullable<Application["resume"]>, "blobUrl"> | null {
  if (!file) return null;
  const { blobUrl, ...rest } = file;
  return rest;
}

async function updateInterview(
  req: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  // 1. Auth check
  const authError = requireOwner(req);
  if (authError) return authError;

  try {
    const id = req.params.id;
    const interviewId = req.params.interviewId;

    // 2. Parse request body
    const body = (await req.json()) as Record<string, unknown>;

    // 3. Validate
    const errors = validateUpdateInterview(body);
    if (errors.length > 0) return validationError(errors);

    // 4. Point read application
    const container = getContainer();
    const { resource } = await container.item(id, id).read<Application>();

    if (!resource || resource.isDeleted) {
      return notFoundError(`Application ${id} not found`);
    }

    // 5. Find interview
    const interviewIndex = resource.interviews.findIndex(
      (i) => i.id === interviewId,
    );
    if (interviewIndex === -1) {
      return notFoundError(`Interview ${interviewId} not found`);
    }

    // 6. Merge updates
    const existing = resource.interviews[interviewIndex];
    const updatedInterview: Interview = {
      ...existing,
      ...(body.type !== undefined && { type: body.type as Interview["type"] }),
      ...(body.date !== undefined && { date: body.date as string }),
      ...(body.outcome !== undefined && {
        outcome: body.outcome as Interview["outcome"],
      }),
      ...(body.interviewers !== undefined && {
        interviewers: body.interviewers as string,
      }),
      ...(body.notes !== undefined && { notes: body.notes as string }),
      ...(body.reflection !== undefined && {
        reflection: body.reflection as string,
      }),
    };

    const updatedInterviews = [...resource.interviews];
    updatedInterviews[interviewIndex] = updatedInterview;

    // 7. Update application
    const now = new Date().toISOString();
    const updated = {
      ...resource,
      interviews: updatedInterviews,
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

app.http("updateInterview", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "applications/{id}/interviews/{interviewId}",
  handler: updateInterview,
});

export default updateInterview;
