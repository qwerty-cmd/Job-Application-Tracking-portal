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
import { successResponse, serverError } from "../../shared/response.js";
import { Application } from "../../shared/types.js";

interface DeletedSummary {
  id: string;
  company: string;
  role: string;
  location: Application["location"];
  dateApplied: string;
  status: string;
  jobPostingUrl: string | null;
  hasResume: boolean;
  hasCoverLetter: boolean;
  hasJobDescription: boolean;
  interviewCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function toDeletedSummary(app: Application): DeletedSummary {
  return {
    id: app.id,
    company: app.company,
    role: app.role,
    location: app.location,
    dateApplied: app.dateApplied,
    status: app.status,
    jobPostingUrl: app.jobPostingUrl,
    hasResume: !!app.resume,
    hasCoverLetter: !!app.coverLetter,
    hasJobDescription: !!(app.jobDescriptionFile || app.jobDescriptionText),
    interviewCount: app.interviews.length,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    deletedAt: app.deletedAt,
  };
}

async function listDeleted(
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
    // 2. Query all soft-deleted, ordered by deletedAt desc
    const query =
      "SELECT * FROM c WHERE c.isDeleted = true ORDER BY c.deletedAt DESC";

    const { resources, requestCharge } = await getContainer()
      .items.query<Application>({ query, parameters: [] })
      .fetchAll();
    trackMetric("CosmosRequestCharge", requestCharge ?? 0);
    log.info("Cosmos query", {
      operation: "query",
      requestCharge,
      resultCount: resources.length,
    });

    // 3. Map to summaries
    const items = resources.map(toDeletedSummary);

    return successResponse({ items });
  } catch (err) {
    log.error("Unhandled error", {
      error: serializeError(err),
      durationMs: Date.now() - startedAt,
    });
    return serverError();
  }
}

app.http("listDeleted", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "applications/deleted",
  handler: listDeleted,
});

export default listDeleted;
