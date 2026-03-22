// ============================================================================
// Validation Helpers
// ============================================================================
// Shared validation logic for API request inputs.
// See docs/project/CLAUDE.md for full validation rules.

import {
  APPLICATION_STATUSES,
  ApplicationStatus,
  REJECTION_REASONS,
  INTERVIEW_TYPES,
  INTERVIEW_OUTCOMES,
  WORK_MODES,
  FILE_TYPES,
  ALLOWED_EXTENSIONS,
  EXTENSION_CONTENT_TYPES,
  FileType,
} from "./types.js";

export interface FieldError {
  field: string;
  message: string;
}

/** Check if a string is a valid YYYY-MM-DD date */
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Check if a YYYY-MM-DD date is in the future (relative to UTC today) */
export function isFutureDate(value: string): boolean {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  return value > todayStr;
}

/** Check if a string is a valid URL */
export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Validate create application request body */
export function validateCreateApplication(
  body: Record<string, unknown>,
): FieldError[] {
  const errors: FieldError[] = [];

  // company — required, max 200
  if (
    !body.company ||
    typeof body.company !== "string" ||
    body.company.trim().length === 0
  ) {
    errors.push({ field: "company", message: "Required field" });
  } else if (body.company.length > 200) {
    errors.push({
      field: "company",
      message: "Must be 200 characters or less",
    });
  }

  // role — required, max 200
  if (
    !body.role ||
    typeof body.role !== "string" ||
    body.role.trim().length === 0
  ) {
    errors.push({ field: "role", message: "Required field" });
  } else if (body.role.length > 200) {
    errors.push({ field: "role", message: "Must be 200 characters or less" });
  }

  // dateApplied — required, valid YYYY-MM-DD, not in future
  if (!body.dateApplied || typeof body.dateApplied !== "string") {
    errors.push({ field: "dateApplied", message: "Required field" });
  } else if (!isValidDate(body.dateApplied)) {
    errors.push({
      field: "dateApplied",
      message: "Must be a valid date in YYYY-MM-DD format",
    });
  } else if (isFutureDate(body.dateApplied)) {
    errors.push({ field: "dateApplied", message: "Cannot be in the future" });
  }

  // status — if provided, must be valid enum
  if (body.status !== undefined) {
    if (!APPLICATION_STATUSES.includes(body.status as ApplicationStatus)) {
      errors.push({
        field: "status",
        message: `Must be one of: ${APPLICATION_STATUSES.join(", ")}`,
      });
    }
  }

  // location — optional, but if provided, validate workMode
  if (body.location !== undefined && body.location !== null) {
    const loc = body.location as Record<string, unknown>;
    if (loc.workMode !== undefined && loc.workMode !== null) {
      if (!WORK_MODES.includes(loc.workMode as any)) {
        errors.push({
          field: "location.workMode",
          message: `Must be one of: ${WORK_MODES.join(", ")}`,
        });
      }
    }
  }

  // jobPostingUrl — optional, but must be valid URL if provided
  if (body.jobPostingUrl !== undefined && body.jobPostingUrl !== null) {
    if (
      typeof body.jobPostingUrl !== "string" ||
      !isValidUrl(body.jobPostingUrl)
    ) {
      errors.push({ field: "jobPostingUrl", message: "Must be a valid URL" });
    }
  }

  // jobDescriptionText — optional, max 50,000 chars
  if (
    body.jobDescriptionText !== undefined &&
    body.jobDescriptionText !== null
  ) {
    if (typeof body.jobDescriptionText !== "string") {
      errors.push({ field: "jobDescriptionText", message: "Must be a string" });
    } else if (body.jobDescriptionText.length > 50000) {
      errors.push({
        field: "jobDescriptionText",
        message: "Must be 50,000 characters or less",
      });
    }
  }

  // rejection — if status is Rejected, rejection.reason is required
  if (body.status === "Rejected") {
    const rejection = body.rejection as Record<string, unknown> | undefined;
    if (!rejection || !rejection.reason) {
      errors.push({
        field: "rejection.reason",
        message: "Required when status is Rejected",
      });
    } else if (!REJECTION_REASONS.includes(rejection.reason as any)) {
      errors.push({
        field: "rejection.reason",
        message: `Must be one of: ${REJECTION_REASONS.join(", ")}`,
      });
    }
  }

  return errors;
}

/** Validate update (PATCH) application request body */
export function validateUpdateApplication(
  body: Record<string, unknown>,
): FieldError[] {
  const errors: FieldError[] = [];

  // company — if provided, max 200
  if (body.company !== undefined) {
    if (typeof body.company !== "string" || body.company.trim().length === 0) {
      errors.push({ field: "company", message: "Must be a non-empty string" });
    } else if (body.company.length > 200) {
      errors.push({
        field: "company",
        message: "Must be 200 characters or less",
      });
    }
  }

  // role — if provided, max 200
  if (body.role !== undefined) {
    if (typeof body.role !== "string" || body.role.trim().length === 0) {
      errors.push({ field: "role", message: "Must be a non-empty string" });
    } else if (body.role.length > 200) {
      errors.push({ field: "role", message: "Must be 200 characters or less" });
    }
  }

  // dateApplied — if provided, valid YYYY-MM-DD, not in future
  if (body.dateApplied !== undefined) {
    if (
      typeof body.dateApplied !== "string" ||
      !isValidDate(body.dateApplied)
    ) {
      errors.push({
        field: "dateApplied",
        message: "Must be a valid date in YYYY-MM-DD format",
      });
    } else if (isFutureDate(body.dateApplied)) {
      errors.push({ field: "dateApplied", message: "Cannot be in the future" });
    }
  }

  // status — if provided, must be valid enum
  if (body.status !== undefined) {
    if (!APPLICATION_STATUSES.includes(body.status as ApplicationStatus)) {
      errors.push({
        field: "status",
        message: `Must be one of: ${APPLICATION_STATUSES.join(", ")}`,
      });
    }
  }

  // location — if provided, validate workMode
  if (body.location !== undefined && body.location !== null) {
    const loc = body.location as Record<string, unknown>;
    if (loc.workMode !== undefined && loc.workMode !== null) {
      if (!WORK_MODES.includes(loc.workMode as any)) {
        errors.push({
          field: "location.workMode",
          message: `Must be one of: ${WORK_MODES.join(", ")}`,
        });
      }
    }
  }

  // jobPostingUrl — if provided, must be valid URL
  if (body.jobPostingUrl !== undefined && body.jobPostingUrl !== null) {
    if (
      typeof body.jobPostingUrl !== "string" ||
      !isValidUrl(body.jobPostingUrl)
    ) {
      errors.push({ field: "jobPostingUrl", message: "Must be a valid URL" });
    }
  }

  // jobDescriptionText — if provided, max 50,000 chars
  if (
    body.jobDescriptionText !== undefined &&
    body.jobDescriptionText !== null
  ) {
    if (typeof body.jobDescriptionText !== "string") {
      errors.push({ field: "jobDescriptionText", message: "Must be a string" });
    } else if (body.jobDescriptionText.length > 50000) {
      errors.push({
        field: "jobDescriptionText",
        message: "Must be 50,000 characters or less",
      });
    }
  }

  // rejection.reason — required if status is Rejected
  if (body.status === "Rejected") {
    const rejection = body.rejection as Record<string, unknown> | undefined;
    if (!rejection || !rejection.reason) {
      errors.push({
        field: "rejection.reason",
        message: "Required when status is Rejected",
      });
    } else if (!REJECTION_REASONS.includes(rejection.reason as any)) {
      errors.push({
        field: "rejection.reason",
        message: `Must be one of: ${REJECTION_REASONS.join(", ")}`,
      });
    }
  }

  // If rejection is provided but status is not Rejected, validate reason anyway
  if (
    body.rejection !== undefined &&
    body.rejection !== null &&
    body.status !== "Rejected"
  ) {
    const rejection = body.rejection as Record<string, unknown>;
    if (
      rejection.reason &&
      !REJECTION_REASONS.includes(rejection.reason as any)
    ) {
      errors.push({
        field: "rejection.reason",
        message: `Must be one of: ${REJECTION_REASONS.join(", ")}`,
      });
    }
  }

  return errors;
}

/** Validate create interview request body */
export function validateCreateInterview(
  body: Record<string, unknown>,
): FieldError[] {
  const errors: FieldError[] = [];

  // type — required, valid enum
  if (!body.type || typeof body.type !== "string") {
    errors.push({ field: "type", message: "Required field" });
  } else if (!INTERVIEW_TYPES.includes(body.type as any)) {
    errors.push({
      field: "type",
      message: `Must be one of: ${INTERVIEW_TYPES.join(", ")}`,
    });
  }

  // date — required, valid YYYY-MM-DD (future allowed — interviews are scheduled ahead)
  if (!body.date || typeof body.date !== "string") {
    errors.push({ field: "date", message: "Required field" });
  } else if (!isValidDate(body.date)) {
    errors.push({
      field: "date",
      message: "Must be a valid date in YYYY-MM-DD format",
    });
  }

  // outcome — required, valid enum
  if (!body.outcome || typeof body.outcome !== "string") {
    errors.push({ field: "outcome", message: "Required field" });
  } else if (!INTERVIEW_OUTCOMES.includes(body.outcome as any)) {
    errors.push({
      field: "outcome",
      message: `Must be one of: ${INTERVIEW_OUTCOMES.join(", ")}`,
    });
  }

  // interviewers — optional, max 500 chars
  if (body.interviewers !== undefined && body.interviewers !== null) {
    if (typeof body.interviewers !== "string") {
      errors.push({ field: "interviewers", message: "Must be a string" });
    } else if (body.interviewers.length > 500) {
      errors.push({
        field: "interviewers",
        message: "Must be 500 characters or less",
      });
    }
  }

  // notes — optional, max 10,000 chars
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string") {
      errors.push({ field: "notes", message: "Must be a string" });
    } else if (body.notes.length > 10000) {
      errors.push({
        field: "notes",
        message: "Must be 10,000 characters or less",
      });
    }
  }

  // reflection — optional, max 10,000 chars
  if (body.reflection !== undefined && body.reflection !== null) {
    if (typeof body.reflection !== "string") {
      errors.push({ field: "reflection", message: "Must be a string" });
    } else if (body.reflection.length > 10000) {
      errors.push({
        field: "reflection",
        message: "Must be 10,000 characters or less",
      });
    }
  }

  return errors;
}

/** Validate update interview request body (PATCH — partial) */
export function validateUpdateInterview(
  body: Record<string, unknown>,
): FieldError[] {
  const errors: FieldError[] = [];

  if (body.type !== undefined) {
    if (!INTERVIEW_TYPES.includes(body.type as any)) {
      errors.push({
        field: "type",
        message: `Must be one of: ${INTERVIEW_TYPES.join(", ")}`,
      });
    }
  }

  if (body.date !== undefined) {
    if (typeof body.date !== "string" || !isValidDate(body.date)) {
      errors.push({
        field: "date",
        message: "Must be a valid date in YYYY-MM-DD format",
      });
    }
  }

  if (body.outcome !== undefined) {
    if (!INTERVIEW_OUTCOMES.includes(body.outcome as any)) {
      errors.push({
        field: "outcome",
        message: `Must be one of: ${INTERVIEW_OUTCOMES.join(", ")}`,
      });
    }
  }

  if (body.interviewers !== undefined && body.interviewers !== null) {
    if (typeof body.interviewers !== "string") {
      errors.push({ field: "interviewers", message: "Must be a string" });
    } else if (body.interviewers.length > 500) {
      errors.push({
        field: "interviewers",
        message: "Must be 500 characters or less",
      });
    }
  }

  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string") {
      errors.push({ field: "notes", message: "Must be a string" });
    } else if (body.notes.length > 10000) {
      errors.push({
        field: "notes",
        message: "Must be 10,000 characters or less",
      });
    }
  }

  if (body.reflection !== undefined && body.reflection !== null) {
    if (typeof body.reflection !== "string") {
      errors.push({ field: "reflection", message: "Must be a string" });
    } else if (body.reflection.length > 10000) {
      errors.push({
        field: "reflection",
        message: "Must be 10,000 characters or less",
      });
    }
  }

  return errors;
}

/** Validate SAS token request */
export function validateSasTokenRequest(
  body: Record<string, unknown>,
): FieldError[] {
  const errors: FieldError[] = [];

  if (!body.applicationId || typeof body.applicationId !== "string") {
    errors.push({ field: "applicationId", message: "Required field" });
  }

  if (!body.fileType || typeof body.fileType !== "string") {
    errors.push({ field: "fileType", message: "Required field" });
  } else if (!FILE_TYPES.includes(body.fileType as FileType)) {
    errors.push({
      field: "fileType",
      message: `Must be one of: ${FILE_TYPES.join(", ")}`,
    });
  }

  if (!body.fileName || typeof body.fileName !== "string") {
    errors.push({ field: "fileName", message: "Required field" });
  } else if (body.fileType && FILE_TYPES.includes(body.fileType as FileType)) {
    const fileType = body.fileType as FileType;
    const fileName = body.fileName as string;
    const ext = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
    const allowed = ALLOWED_EXTENSIONS[fileType];
    if (!allowed.includes(ext)) {
      errors.push({
        field: "fileName",
        message: `File extension must be one of: ${allowed.join(", ")}`,
      });
    }
  }

  if (!body.contentType || typeof body.contentType !== "string") {
    errors.push({ field: "contentType", message: "Required field" });
  } else if (body.fileName && typeof body.fileName === "string") {
    const fileName = body.fileName as string;
    const ext = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
    const expectedContentType = EXTENSION_CONTENT_TYPES[ext];
    if (expectedContentType && body.contentType !== expectedContentType) {
      errors.push({
        field: "contentType",
        message: `Must match file extension: ${expectedContentType}`,
      });
    }
  }

  return errors;
}

/** Validate interview reorder request */
export function validateReorderRequest(
  body: Record<string, unknown>,
  existingIds: string[],
): FieldError[] {
  const errors: FieldError[] = [];

  if (!Array.isArray(body.order)) {
    errors.push({
      field: "order",
      message: "Must be an array of interview IDs",
    });
    return errors;
  }

  const orderIds = body.order as string[];

  if (orderIds.length !== existingIds.length) {
    errors.push({
      field: "order",
      message: "Must contain all interview IDs (no partial reorder)",
    });
    return errors;
  }

  const missingIds = existingIds.filter((id) => !orderIds.includes(id));
  if (missingIds.length > 0) {
    errors.push({
      field: "order",
      message: `Missing interview IDs: ${missingIds.join(", ")}`,
    });
  }

  const extraIds = orderIds.filter((id) => !existingIds.includes(id));
  if (extraIds.length > 0) {
    errors.push({
      field: "order",
      message: `Unknown interview IDs: ${extraIds.join(", ")}`,
    });
  }

  return errors;
}
