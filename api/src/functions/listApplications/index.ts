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
import { Application, ApplicationSummary } from "../../shared/types.js";

const VALID_SORT_FIELDS = ["dateApplied", "company", "status", "updatedAt"];

function toSummary(app: Application): ApplicationSummary {
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
  };
}

async function listApplications(
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
    // 2. Parse query parameters
    const status = req.query.get("status");
    const from = req.query.get("from");
    const to = req.query.get("to");

    let sortBy = req.query.get("sortBy") ?? "dateApplied";
    if (!VALID_SORT_FIELDS.includes(sortBy)) sortBy = "dateApplied";

    let sortOrder = req.query.get("sortOrder") ?? "desc";
    if (sortOrder !== "asc" && sortOrder !== "desc") sortOrder = "desc";

    let page = parseInt(req.query.get("page") ?? "1", 10);
    if (isNaN(page) || page < 1) page = 1;

    let pageSize = parseInt(req.query.get("pageSize") ?? "20", 10);
    if (isNaN(pageSize) || pageSize < 1) pageSize = 20;
    if (pageSize > 100) pageSize = 100;

    // 3. Build Cosmos SQL query
    const conditions: string[] = ["c.isDeleted = false"];
    const parameters: Array<{ name: string; value: string }> = [];

    if (status) {
      conditions.push("c.status = @status");
      parameters.push({ name: "@status", value: status });
    }
    if (from) {
      conditions.push("c.dateApplied >= @from");
      parameters.push({ name: "@from", value: from });
    }
    if (to) {
      conditions.push("c.dateApplied <= @to");
      parameters.push({ name: "@to", value: to });
    }

    const whereClause = conditions.join(" AND ");
    // SAFETY: sortBy is validated against VALID_SORT_FIELDS whitelist above;
    // sortOrder is constrained to "asc" | "desc". Both are safe for interpolation.
    const query = `SELECT * FROM c WHERE ${whereClause} ORDER BY c.${sortBy} ${sortOrder.toUpperCase()}`;

    // 4. Execute query
    const { resources, requestCharge } = await getContainer()
      .items.query<Application>({ query, parameters })
      .fetchAll();
    trackMetric("CosmosRequestCharge", requestCharge ?? 0);
    log.info("Cosmos query", {
      operation: "query",
      requestCharge,
      resultCount: resources.length,
    });

    // 5. In-memory pagination
    const totalItems = resources.length;
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
    const offset = (page - 1) * pageSize;
    const pageItems = resources.slice(offset, offset + pageSize);

    // 6. Map to summaries
    const items = pageItems.map(toSummary);

    // 7. Return response
    return successResponse({
      items,
      pagination: { page, pageSize, totalItems, totalPages },
    });
  } catch (err) {
    log.error("Unhandled error", {
      error: serializeError(err),
      durationMs: Date.now() - startedAt,
    });
    return serverError();
  }
}

app.http("listApplications", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "applications",
  handler: listApplications,
});

export default listApplications;
