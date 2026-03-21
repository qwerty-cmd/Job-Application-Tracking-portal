// ============================================================================
// Authentication Helper
// ============================================================================
// Validates the x-ms-client-principal header from Azure Static Web Apps.
// Returns 401 if missing/invalid, 403 if authenticated but missing 'owner' role.
// See CLAUDE.md: "requireOwner() helper in api/shared/auth.ts"

import { HttpRequest, HttpResponseInit } from "@azure/functions";

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
): ClientPrincipal | null {
  const header = req.headers.get("x-ms-client-principal");
  if (!header) {
    return null;
  }

  try {
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    const principal = JSON.parse(decoded) as ClientPrincipal;

    if (!principal.userRoles || !Array.isArray(principal.userRoles)) {
      return null;
    }

    return principal;
  } catch {
    return null;
  }
}

/**
 * Validates that the request has a valid SWA session with the 'owner' role.
 * Returns null if authorized, or an HttpResponseInit for the error response.
 */
export function requireOwner(req: HttpRequest): HttpResponseInit | null {
  const principal = decodeClientPrincipal(req);

  if (!principal) {
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
