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

async function deleteInterview(
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

    // 2. Point read application
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

    // 3. Find interview
    const interviewIndex = resource.interviews.findIndex(
      (i) => i.id === interviewId,
    );
    if (interviewIndex === -1) {
      return notFoundError(`Interview ${interviewId} not found`);
    }

    // 4. Remove interview and renumber rounds
    const remaining = resource.interviews.filter((i) => i.id !== interviewId);
    const renumbered = remaining.map((interview, index) => ({
      ...interview,
      round: index + 1,
    }));

    // 5. Update application
    const now = new Date().toISOString();
    const updated = {
      ...resource,
      interviews: renumbered,
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

    // 6. Strip blobUrl and return
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

app.http("deleteInterview", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "applications/{id}/interviews/{interviewId}",
  handler: deleteInterview,
});

export default deleteInterview;
