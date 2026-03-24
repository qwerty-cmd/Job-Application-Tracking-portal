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
  stripBlobUrl,
  createActivityEvent,
} from "../../shared/response.js";
import { Application } from "../../shared/types.js";

async function restoreApplication(
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
      history: [
        ...(resource.history ?? []),
        createActivityEvent("application_restored", "Application restored"),
      ],
      updatedAt: now,
    };

    const replaceStart = Date.now();
    const { resource: restored, requestCharge: replaceRequestCharge } =
      await container.item(id, id).replace(updated);
    trackMetric("CosmosRequestCharge", replaceRequestCharge ?? 0);
    log.info("Cosmos replace", {
      operation: "replace",
      partitionKey: id,
      requestCharge: replaceRequestCharge,
      durationMs: Date.now() - replaceStart,
    });

    // 5. Strip blobUrl from file fields
    const application = {
      ...restored,
      resume: stripBlobUrl(restored!.resume),
      coverLetter: stripBlobUrl(restored!.coverLetter),
      jobDescriptionFile: stripBlobUrl(restored!.jobDescriptionFile),
    };

    trackEvent("ApplicationRestored", { applicationId: id });
    log.info("Request completed", {
      status: 200,
      durationMs: Date.now() - startedAt,
      applicationId: id,
    });
    return successResponse(application);
  } catch (err) {
    log.error("Unhandled error", {
      error: serializeError(err),
      durationMs: Date.now() - startedAt,
    });
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
