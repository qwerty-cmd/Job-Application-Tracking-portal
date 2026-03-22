// ============================================================================
// Structured Logger
// ============================================================================
// Wraps InvocationContext logging with structured JSON output.
// App Insights parses structured logs into queryable fields.
// See docs/logging-improvement-plan.md: B-1

import { InvocationContext } from "@azure/functions";

export interface LogProperties {
  [key: string]: unknown;
}

export interface Logger {
  info(message: string, properties?: LogProperties): void;
  warn(message: string, properties?: LogProperties): void;
  error(message: string, properties?: LogProperties): void;
}

/**
 * Safely serialize an error for structured logging.
 * Extracts message, name, stack, and any additional properties (e.g. statusCode).
 */
export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      ...(Object.keys(err).length > 0
        ? Object.fromEntries(
            Object.entries(err).filter(
              ([k]) => !["name", "message", "stack"].includes(k),
            ),
          )
        : {}),
    };
  }
  return { value: String(err) };
}

/**
 * Create a structured logger bound to a specific function invocation.
 * Auto-includes functionName and invocationId in every log entry.
 */
export function createLogger(context: InvocationContext): Logger {
  const base = {
    functionName: context.functionName,
    invocationId: context.invocationId,
  };

  function format(
    level: string,
    message: string,
    properties?: LogProperties,
  ): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      ...base,
      message,
      ...(properties && Object.keys(properties).length > 0
        ? { properties }
        : {}),
    });
  }

  return {
    info(message: string, properties?: LogProperties): void {
      context.log(format("INFO", message, properties));
    },
    warn(message: string, properties?: LogProperties): void {
      context.warn(format("WARN", message, properties));
    },
    error(message: string, properties?: LogProperties): void {
      context.error(format("ERROR", message, properties));
    },
  };
}
