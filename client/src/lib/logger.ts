import { appInsights } from "./appInsights";

const isTestMode = import.meta.env.MODE === "test";

export type LogLevel = "info" | "warn" | "error";

interface LogPayload {
  message: string;
  properties?: Record<string, unknown>;
}

function toStringProps(
  properties?: Record<string, unknown>,
): Record<string, string> | undefined {
  if (!properties) return undefined;
  return Object.fromEntries(
    Object.entries(properties).map(([k, v]) => [k, String(v)]),
  );
}

function writeConsole(level: LogLevel, payload: LogPayload): void {
  const out = { ...payload, timestamp: new Date().toISOString(), level };
  if (level === "error") {
    console.error(out);
    return;
  }
  if (level === "warn") {
    console.warn(out);
    return;
  }
  if (import.meta.env.DEV && !isTestMode) {
    console.info(out);
  }
}

export const logger = {
  info(message: string, properties?: Record<string, unknown>): void {
    const customProps = toStringProps(properties);
    writeConsole("info", { message, properties });
    appInsights?.trackTrace(
      {
        message,
        severityLevel: 1,
      },
      customProps,
    );
  },

  warn(message: string, properties?: Record<string, unknown>): void {
    const customProps = toStringProps(properties);
    writeConsole("warn", { message, properties });
    appInsights?.trackTrace(
      {
        message,
        severityLevel: 2,
      },
      customProps,
    );
  },

  error(message: string, properties?: Record<string, unknown>): void {
    const customProps = toStringProps(properties);
    writeConsole("error", { message, properties });
    appInsights?.trackException(
      {
        exception: new Error(message),
      },
      customProps,
    );
  },

  event(name: string, properties?: Record<string, unknown>): void {
    appInsights?.trackEvent({ name }, toStringProps(properties));
    if (import.meta.env.DEV && !isTestMode) {
      console.info({
        event: name,
        properties,
        timestamp: new Date().toISOString(),
      });
    }
  },
};
