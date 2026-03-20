import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { requireOwner } from "../../shared/auth.js";
import { getContainer } from "../../shared/cosmosClient.js";
import {
  successResponse,
  notFoundError,
  serverError,
} from "../../shared/response.js";
import { Application } from "../../shared/types.js";

function stripBlobUrl(
  file: Application["resume"],
): Omit<NonNullable<Application["resume"]>, "blobUrl"> | null {
  if (!file) return null;
  const { blobUrl, ...rest } = file;
  return rest;
}

async function deleteInterview(
  req: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  // 1. Auth check
  const authError = requireOwner(req);
  if (authError) return authError;

  try {
    const id = req.params.id;
    const interviewId = req.params.interviewId;

    // 2. Point read application
    const container = getContainer();
    const { resource } = await container.item(id, id).read<Application>();

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

    const { resource: saved } = await container.item(id, id).replace(updated);

    // 6. Strip blobUrl and return
    const application = {
      ...saved,
      resume: stripBlobUrl(saved!.resume),
      coverLetter: stripBlobUrl(saved!.coverLetter),
      jobDescriptionFile: stripBlobUrl(saved!.jobDescriptionFile),
    };

    return successResponse(application);
  } catch {
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
