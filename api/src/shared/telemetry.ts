import appInsights from "applicationinsights";

let started = false;
let enabled = false;

function canEnableTelemetry(): boolean {
  const conn = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  return typeof conn === "string" && conn.trim().length > 0;
}

export function initTelemetry(): void {
  if (started) return;
  started = true;

  if (!canEnableTelemetry()) {
    return;
  }

  appInsights
    .setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, false)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true, true)
    .setUseDiskRetryCaching(true)
    .start();

  enabled = true;
}

export function trackEvent(
  name: string,
  properties?: Record<string, unknown>,
): void {
  if (!enabled) return;
  appInsights.defaultClient.trackEvent({
    name,
    properties: properties
      ? Object.fromEntries(
          Object.entries(properties).map(([k, v]) => [k, String(v)]),
        )
      : undefined,
  });
}

export function trackMetric(name: string, value: number): void {
  if (!enabled) return;
  appInsights.defaultClient.trackMetric({ name, value });
}
