import { ApplicationInsights } from "@microsoft/applicationinsights-web";

const connectionString =
  import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING ?? "";

export const appInsights = connectionString
  ? new ApplicationInsights({
      config: {
        connectionString,
        enableAutoRouteTracking: true,
        disableFetchTracking: false,
        disableAjaxTracking: false,
      },
    })
  : null;

export function initAppInsights(): void {
  if (!appInsights) return;
  appInsights.loadAppInsights();
}
