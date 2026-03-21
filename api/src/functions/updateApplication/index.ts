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
  errorResponse,
  notFoundError,
  validationError,
  serverError,
  stripBlobUrl,
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
import { validateUpdateApplication } from "../../shared/validation.js";

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

async function updateApplication(
  req: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  const authError = requireOwner(req);
  if (authError) return authError;

  try {
    const id = req.params.id;
    const { resource } = await getContainer().item(id, id).read<Application>();

    if (!resource || resource.isDeleted) {
      return notFoundError(`Application ${id} not found`);
    }

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

    // Business rule: if setting status to Rejected and body doesn't include
    // rejection.reason, but the existing record already has one, carry it forward
    // so validation passes (validateUpdateApplication requires rejection.reason
    // in the body when status is Rejected)
    if (
      body.status === "Rejected" &&
      !(body.rejection as Record<string, unknown> | undefined)?.reason &&
      resource.rejection?.reason
    ) {
      body.rejection = {
        reason: resource.rejection.reason,
        notes: resource.rejection.notes,
      };
    }

    const errors = validateUpdateApplication(body);
    if (errors.length > 0) {
      return validationError(errors);
    }

    // Whitelist updatable fields to prevent mass assignment
    const UPDATABLE_FIELDS = [
      "company",
      "role",
      "dateApplied",
      "status",
      "jobPostingUrl",
      "jobDescriptionText",
    ] as const;
    const sanitized: Record<string, unknown> = {};
    for (const key of UPDATABLE_FIELDS) {
      if (key in body) sanitized[key] = body[key];
    }
    // Sanitize nested objects to strip unknown fields
    if ("location" in body) {
      sanitized.location = sanitizeLocation(body.location);
    }
    if ("rejection" in body) {
      sanitized.rejection = sanitizeRejection(body.rejection);
    }

    const merged = {
      ...resource,
      ...sanitized,
      updatedAt: new Date().toISOString(),
    };

    // Post-merge invariant: if status is Rejected, rejection.reason must exist
    if (merged.status === "Rejected" && !merged.rejection?.reason) {
      return validationError([
        {
          field: "rejection.reason",
          message: "Required when status is Rejected",
        },
      ]);
    }

    await getContainer().item(id, id).replace(merged);

    const response = {
      ...merged,
      resume: stripBlobUrl(merged.resume),
      coverLetter: stripBlobUrl(merged.coverLetter),
      jobDescriptionFile: stripBlobUrl(merged.jobDescriptionFile),
    };

    return successResponse(response);
  } catch {
    return serverError();
  }
}

app.http("updateApplication", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "applications/{id}",
  handler: updateApplication,
});

export default updateApplication;
