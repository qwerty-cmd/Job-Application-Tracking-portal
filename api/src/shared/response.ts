// ============================================================================
// API Response Helpers
// ============================================================================
// Consistent { data, error } response shape for all endpoints.
// See CLAUDE.md: "All Functions return consistent { data, error } response shape"

import { HttpResponseInit } from "@azure/functions";
import { ApiError } from "./types.js";

export function successResponse(
  data: unknown,
  status: number = 200,
): HttpResponseInit {
  return {
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, error: null }),
  };
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: Array<{ field: string; message: string }>,
): HttpResponseInit {
  const error: ApiError = { code, message };
  if (details && details.length > 0) {
    error.details = details;
  }
  return {
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: null, error }),
  };
}

export function validationError(
  details: Array<{ field: string; message: string }>,
): HttpResponseInit {
  return errorResponse(400, "VALIDATION_ERROR", "Validation failed", details);
}

export function notFoundError(message: string): HttpResponseInit {
  return errorResponse(404, "NOT_FOUND", message);
}

export function serverError(
  message: string = "Internal server error",
): HttpResponseInit {
  return errorResponse(500, "INTERNAL_ERROR", message);
}
