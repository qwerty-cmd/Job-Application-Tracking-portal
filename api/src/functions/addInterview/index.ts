import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { randomUUID } from "crypto";
import { requireOwner } from "../../shared/auth.js";
import { createLogger, serializeError } from "../../shared/logger.js";
import { getContainer } from "../../shared/cosmosClient.js";
import { trackEvent, trackMetric } from "../../shared/telemetry.js";
import {
  successResponse,
  errorResponse,
  notFoundError,
  serverError,
  validationError,
  stripBlobUrl,
  createActivityEvent,
} from "../../shared/response.js";
import { Application, STATUS_ORDER } from "../../shared/types.js";
import { validateCreateInterview } from "../../shared/validation.js";

async function addInterview(
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
    const readStart = Date.now();
    const { resource, requestCharge: readRequestCharge } = await container
      .item(id, id)
      .read<Application>();
    trackMetric("CosmosRequestCharge", readRequestCharge ?? 0);
    log.info("Cosmos read", {
      operation: "read",
      partitionKey: id,
      requestCharge: readRequestCharge,
      durationMs: Date.now() - readStart,
    });

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

    // 7. Build history events
    const newEvents = [
      createActivityEvent(
        "interview_added",
        `Interview added: ${newInterview.type} (Round ${newInterview.round})`,
      ),
    ];
    if (newStatus !== resource.status) {
      newEvents.push(
        createActivityEvent(
          "status_changed",
          `Status changed to ${newStatus}`,
        ),
      );
    }

    // 8. Update application
    const now = new Date().toISOString();
    const updated = {
      ...resource,
      status: newStatus,
      interviews: [...resource.interviews, newInterview],
      history: [...(resource.history ?? []), ...newEvents],
      updatedAt: now,
    };

    const replaceStart = Date.now();
    const { resource: saved, requestCharge: replaceRequestCharge } =
      await container.item(id, id).replace(updated);
    trackMetric("CosmosRequestCharge", replaceRequestCharge ?? 0);
    log.info("Cosmos replace", {
      operation: "replace",
      partitionKey: id,
      requestCharge: replaceRequestCharge,
      durationMs: Date.now() - replaceStart,
    });

    // 8. Strip blobUrl and return
    const application = {
      ...saved,
      resume: stripBlobUrl(saved!.resume),
      coverLetter: stripBlobUrl(saved!.coverLetter),
      jobDescriptionFile: stripBlobUrl(saved!.jobDescriptionFile),
    };

    trackEvent("InterviewAdded", {
      applicationId: id,
      type: newInterview.type,
      outcome: newInterview.outcome,
    });
    log.info("Request completed", {
      status: 201,
      durationMs: Date.now() - startedAt,
      applicationId: id,
    });
    return successResponse(application, 201);
  } catch (err) {
    log.error("Unhandled error", {
      error: serializeError(err),
      durationMs: Date.now() - startedAt,
    });
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
