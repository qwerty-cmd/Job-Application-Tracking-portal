import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { requireOwner } from "../../shared/auth.js";
import { createLogger, serializeError } from "../../shared/logger.js";
import { trackMetric } from "../../shared/telemetry.js";
import { getContainer } from "../../shared/cosmosClient.js";
import {
  successResponse,
  errorResponse,
  notFoundError,
  serverError,
  validationError,
  stripBlobUrl,
  createActivityEvent,
} from "../../shared/response.js";
import { Application, Interview } from "../../shared/types.js";
import { validateUpdateInterview } from "../../shared/validation.js";

async function updateInterview(
  req: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const log = createLogger(context);
  const startedAt = Date.now();
  log.info("Request started", {
    method: req.method,
    url: req.url,
    routeParams: req.params,
    contentLength: req.headers.get("content-length"),
  });
  // 1. Auth check
  const authError = requireOwner(req, log);
  if (authError) return authError;

  try {
    const id = req.params.id;
    const interviewId = req.params.interviewId;

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
    const errors = validateUpdateInterview(body);
    if (errors.length > 0) return validationError(errors);

    // 4. Point read application
    const container = getContainer();
    const { resource, requestCharge } = await container
      .item(id, id)
      .read<Application>();
    trackMetric("CosmosRequestCharge", requestCharge ?? 0);
    log.info("Cosmos read", {
      operation: "read",
      partitionKey: id,
      requestCharge,
    });

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
      history: [
        ...(resource.history ?? []),
        createActivityEvent(
          "interview_updated",
          `Interview updated: ${updatedInterview.type} (Round ${updatedInterview.round})`,
        ),
      ],
      updatedAt: now,
    };

    const { resource: saved, requestCharge: replaceCharge } = await container
      .item(id, id)
      .replace(updated);
    trackMetric("CosmosRequestCharge", replaceCharge ?? 0);
    log.info("Cosmos replace", {
      operation: "replace",
      partitionKey: id,
      requestCharge: replaceCharge,
    });

    // 8. Strip blobUrl and return
    const application = {
      ...saved,
      resume: stripBlobUrl(saved!.resume),
      coverLetter: stripBlobUrl(saved!.coverLetter),
      jobDescriptionFile: stripBlobUrl(saved!.jobDescriptionFile),
    };

    return successResponse(application);
  } catch (err) {
    log.error("Unhandled error", {
      error: serializeError(err),
      durationMs: Date.now() - startedAt,
    });
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
