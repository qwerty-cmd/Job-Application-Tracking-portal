import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { requireOwner } from "../../shared/auth.js";
import { createLogger, serializeError } from "../../shared/logger.js";
import { getContainer } from "../../shared/cosmosClient.js";
import { trackEvent, trackMetric } from "../../shared/telemetry.js";
import {
  successResponse,
  notFoundError,
  serverError,
} from "../../shared/response.js";
import { Application } from "../../shared/types.js";

async function deleteApplication(
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

    // 2. Point read
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

    const replaceStart = Date.now();
    const { requestCharge: replaceRequestCharge } = await container
      .item(id, id)
      .replace(updated);
    trackMetric("CosmosRequestCharge", replaceRequestCharge ?? 0);
    log.info("Cosmos replace", {
      operation: "replace",
      partitionKey: id,
      requestCharge: replaceRequestCharge,
      durationMs: Date.now() - replaceStart,
    });
    trackEvent("ApplicationDeleted", { applicationId: id });

    // 5. Return success
    log.info("Request completed", {
      status: 200,
      durationMs: Date.now() - startedAt,
      applicationId: id,
    });
    return successResponse({ id, deleted: true });
  } catch (err) {
    log.error("Unhandled error", {
      error: serializeError(err),
      durationMs: Date.now() - startedAt,
    });
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
