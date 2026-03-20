import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { requireOwner } from "../../shared/auth.js";
import { getContainer } from "../../shared/cosmosClient.js";
import { validateCreateApplication } from "../../shared/validation.js";
import {
  successResponse,
  validationError,
  serverError,
} from "../../shared/response.js";
import { Application } from "../../shared/types.js";

async function createApplication(
  req: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  // 1. Auth check
  const authError = requireOwner(req);
  if (authError) return authError;

  try {
    // 2. Parse body
    const body = (await req.json()) as Record<string, unknown>;

    // 3. Validate
    const errors = validateCreateApplication(body);
    if (errors.length > 0) return validationError(errors);

    // 4. Build document
    const now = new Date().toISOString();
    const location = body.location !== undefined ? body.location : null;
    const rejection = body.rejection !== undefined ? body.rejection : null;

    const doc: Application = {
      id: crypto.randomUUID(),
      company: body.company as string,
      role: body.role as string,
      location: location as Application["location"],
      dateApplied: body.dateApplied as string,
      jobPostingUrl: (body.jobPostingUrl as string) ?? null,
      jobDescriptionText: (body.jobDescriptionText as string) ?? null,
      jobDescriptionFile: null,
      status: (body.status as Application["status"]) ?? "Applying",
      resume: null,
      coverLetter: null,
      rejection: rejection as Application["rejection"],
      interviews: [],
      isDeleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    // 5. Create in Cosmos
    await getContainer().items.create(doc);

    // 6. Return 201
    return successResponse(doc, 201);
  } catch {
    return serverError();
  }
}

app.http("createApplication", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "applications",
  handler: createApplication,
});

export default createApplication;
