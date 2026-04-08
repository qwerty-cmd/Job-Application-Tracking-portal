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

  // The Functions host already auto-collects requests, dependencies,
  // exceptions, performance, and console logs via its own App Insights
  // pipeline. Enabling those here causes conflicts and breaks the host's
  // request tracking (visible in Performance/Failures tabs).
  // Only initialize the SDK for manual trackEvent/trackMetric calls.
  appInsights
    .setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoCollectRequests(false)
    .setAutoCollectPerformance(false, false)
    .setAutoCollectExceptions(false)
    .setAutoCollectDependencies(false)
    .setAutoCollectConsole(false, false)
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
  appInsights.defaultClient.flush();
}

export function trackMetric(name: string, value: number): void {
  if (!enabled) return;
  appInsights.defaultClient.trackMetric({ name, value });
  appInsights.defaultClient.flush();
}
