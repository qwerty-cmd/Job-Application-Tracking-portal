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
} from "../../shared/response.js";
import { Application } from "../../shared/types.js";
import { validateReorderRequest } from "../../shared/validation.js";

async function reorderInterviews(
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

    // 3. Validate order array (basic type check before Cosmos read)
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

    // 5. Validate order against existing interviews using shared validator
    const existingIds = resource.interviews.map((i) => i.id);
    const reorderErrors = validateReorderRequest(body, existingIds);
    if (reorderErrors.length > 0) {
      return validationError(reorderErrors);
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

app.http("reorderInterviews", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "applications/{id}/interviews/reorder",
  handler: reorderInterviews,
});

export default reorderInterviews;
