// ============================================================================
// Authentication Helper
// ============================================================================
// Validates the x-ms-client-principal header from Azure Static Web Apps.
// Returns 401 if missing/invalid, 403 if authenticated but missing 'owner' role.
// See CLAUDE.md: "requireOwner() helper in api/shared/auth.ts"

import { HttpRequest, HttpResponseInit } from "@azure/functions";
import { Logger } from "./logger.js";

export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
}

/**
 * Decodes the x-ms-client-principal header from Azure SWA.
 * Returns null if the header is absent or cannot be decoded.
 */
export function decodeClientPrincipal(
  req: HttpRequest,
  logger?: Logger,
): ClientPrincipal | null {
  const header = req.headers.get("x-ms-client-principal");
  if (!header) {
    return null;
  }

  try {
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    const principal = JSON.parse(decoded) as ClientPrincipal;

    if (!principal.userRoles || !Array.isArray(principal.userRoles)) {
      logger?.warn("Auth decode — missing or invalid userRoles array");
      return null;
    }

    return principal;
  } catch (err) {
    logger?.warn("Auth decode — failed to parse client principal header", {
      error: String(err),
    });
    return null;
  }
}

/**
 * Validates that the request has a valid SWA session with the 'owner' role.
 * Returns null if authorized, or an HttpResponseInit for the error response.
 * Pass an optional Logger for auth failure visibility in App Insights.
 */
export function requireOwner(
  req: HttpRequest,
  logger?: Logger,
): HttpResponseInit | null {
  const principal = decodeClientPrincipal(req, logger);

  if (!principal) {
    logger?.warn("Auth failed — no valid session", {
      method: req.method,
      url: req.url,
    });
    return {
      status: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: null,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      }),
    };
  }

  if (!principal.userRoles.includes("owner")) {
    logger?.warn("Auth failed — missing owner role", {
      userId: principal.userId,
      identityProvider: principal.identityProvider,
    });
    return {
      status: 403,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: null,
        error: { code: "FORBIDDEN", message: "Owner role required" },
      }),
    };
  }

  return null; // Authorized
}
