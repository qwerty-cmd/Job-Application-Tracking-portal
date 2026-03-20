import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { requireOwner } from "../../shared/auth.js";
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
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  // 1. Auth check
  const authError = requireOwner(req);
  if (authError) return authError;

  try {
    // 2. Query all soft-deleted, ordered by deletedAt desc
    const query =
      "SELECT * FROM c WHERE c.isDeleted = true ORDER BY c.deletedAt DESC";

    const { resources } = await getContainer()
      .items.query<Application>({ query, parameters: [] })
      .fetchAll();

    // 3. Map to summaries
    const items = resources.map(toDeletedSummary);

    return successResponse({ items });
  } catch {
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
