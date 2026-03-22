import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { requireOwner } from "../../shared/auth.js";
import { getContainer } from "../../shared/cosmosClient.js";
import { successResponse, serverError } from "../../shared/response.js";
import {
  Application,
  APPLICATION_STATUSES,
  INTERVIEW_TYPES,
  ApplicationStatus,
  InterviewType,
} from "../../shared/types.js";

function getDefaultFrom(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function getDefaultTo(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function getStats(
  req: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  // 1. Auth check
  const authError = requireOwner(req);
  if (authError) return authError;

  try {
    // 2. Parse query params with defaults
    const from = req.query.get("from") ?? getDefaultFrom();
    const to = req.query.get("to") ?? getDefaultTo();

    // 3. Query Cosmos — isDeleted=false + date range
    const query =
      "SELECT * FROM c WHERE c.isDeleted = false AND c.dateApplied >= @from AND c.dateApplied <= @to";
    const parameters = [
      { name: "@from", value: from },
      { name: "@to", value: to },
    ];

    const { resources } = await getContainer()
      .items.query<Application>({ query, parameters })
      .fetchAll();

    // 4. Aggregate by status
    const byStatus: Record<string, number> = {};
    for (const status of APPLICATION_STATUSES) {
      byStatus[status] = 0;
    }
    for (const app of resources) {
      byStatus[app.status] = (byStatus[app.status] ?? 0) + 1;
    }

    // 5. Aggregate interviews by type
    const interviewsByType: Record<string, number> = {};
    for (const type of INTERVIEW_TYPES) {
      interviewsByType[type] = 0;
    }
    let totalInterviews = 0;

    // 6. Outcomes by stage — where ended/stalled applications landed
    const outcomesByStage: Record<string, number> = {
      "No Response": 0,
      "Pre-Interview": 0,
    };
    for (const type of INTERVIEW_TYPES) {
      outcomesByStage[type] = 0;
    }

    for (const app of resources) {
      for (const interview of app.interviews) {
        totalInterviews++;
        interviewsByType[interview.type] =
          (interviewsByType[interview.type] ?? 0) + 1;
      }

      // Classify ended/stalled applications
      if (app.status === "Rejected" || app.status === "Withdrawn") {
        if (app.interviews.length > 0) {
          const last = app.interviews[app.interviews.length - 1];
          outcomesByStage[last.type] = (outcomesByStage[last.type] ?? 0) + 1;
        } else {
          outcomesByStage["Pre-Interview"] += 1;
        }
      } else if (
        app.status === "Applying" ||
        app.status === "Application Submitted"
      ) {
        outcomesByStage["No Response"] += 1;
      }
    }

    // 7. Return response
    return successResponse({
      period: { from, to },
      totalApplications: resources.length,
      byStatus,
      totalInterviews,
      interviewsByType,
      outcomesByStage,
    });
  } catch {
    return serverError();
  }
}

app.http("getStats", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "applications/stats",
  handler: getStats,
});

export default getStats;
