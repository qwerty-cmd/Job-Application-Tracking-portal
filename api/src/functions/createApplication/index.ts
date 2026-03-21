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
  errorResponse,
  validationError,
  serverError,
} from "../../shared/response.js";
import {
  Application,
  Location,
  Rejection,
  WORK_MODES,
  WorkMode,
  REJECTION_REASONS,
  RejectionReason,
} from "../../shared/types.js";

/** Sanitize location to only known fields */
function sanitizeLocation(loc: unknown): Location | null {
  if (!loc || typeof loc !== "object") return null;
  const raw = loc as Record<string, unknown>;
  return {
    city: typeof raw.city === "string" ? raw.city : "",
    country: typeof raw.country === "string" ? raw.country : "",
    workMode: WORK_MODES.includes(raw.workMode as WorkMode)
      ? (raw.workMode as WorkMode)
      : "Remote",
    other: typeof raw.other === "string" ? raw.other : null,
  };
}

/** Sanitize rejection to only known fields */
function sanitizeRejection(rej: unknown): Rejection | null {
  if (!rej || typeof rej !== "object") return null;
  const raw = rej as Record<string, unknown>;
  if (!raw.reason || !REJECTION_REASONS.includes(raw.reason as RejectionReason))
    return null;
  return {
    reason: raw.reason as RejectionReason,
    notes: typeof raw.notes === "string" ? raw.notes : "",
  };
}

async function createApplication(
  req: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  // 1. Auth check
  const authError = requireOwner(req);
  if (authError) return authError;

  try {
    // 2. Parse body
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return errorResponse(
        400,
        "INVALID_BODY",
        "Request body must be valid JSON",
      );
    }

    // 3. Validate
    const errors = validateCreateApplication(body);
    if (errors.length > 0) return validationError(errors);

    // 4. Build document
    const now = new Date().toISOString();

    const doc: Application = {
      id: crypto.randomUUID(),
      company: body.company as string,
      role: body.role as string,
      location: sanitizeLocation(body.location),
      dateApplied: body.dateApplied as string,
      jobPostingUrl: (body.jobPostingUrl as string) ?? null,
      jobDescriptionText: (body.jobDescriptionText as string) ?? null,
      jobDescriptionFile: null,
      status: "Applying", // Initial status is always "Applying" per R1
      resume: null,
      coverLetter: null,
      rejection: sanitizeRejection(body.rejection),
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
