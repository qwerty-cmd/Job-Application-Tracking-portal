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
  notFoundError,
  serverError,
  stripBlobUrl,
} from "../../shared/response.js";
import { Application } from "../../shared/types.js";

async function getApplication(
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
    // 2. Get ID from route params
    const id = req.params.id;

    // 3. Point read from Cosmos (partition key is /id)
    const { resource, requestCharge } = await getContainer()
      .item(id, id)
      .read<Application>();
    trackMetric("CosmosRequestCharge", requestCharge ?? 0);
    log.info("Cosmos read", {
      operation: "read",
      partitionKey: id,
      requestCharge,
    });

    // 4. Not found
    if (!resource) {
      return notFoundError(`Application ${id} not found`);
    }

    // 5. Soft-deleted
    if (resource.isDeleted) {
      return notFoundError(`Application ${id} not found`);
    }

    // 6. Strip blobUrl from file fields
    const application = {
      ...resource,
      resume: stripBlobUrl(resource.resume),
      coverLetter: stripBlobUrl(resource.coverLetter),
      jobDescriptionFile: stripBlobUrl(resource.jobDescriptionFile),
    };

    // 7. Return success
    return successResponse(application);
  } catch (err) {
    log.error("Unhandled error", {
      error: serializeError(err),
      durationMs: Date.now() - startedAt,
    });
    return serverError();
  }
}

app.http("getApplication", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "applications/{id}",
  handler: getApplication,
});

export default getApplication;
