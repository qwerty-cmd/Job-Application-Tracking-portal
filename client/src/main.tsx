import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { initAppInsights } from "@/lib/appInsights";
import { isDemoMode, startDemoWorker } from "@/lib/demoMode";
import App from "./App";
import "./index.css";

initAppInsights();

async function enableMocking() {
  if (
    import.meta.env.MODE === "development" &&
    import.meta.env.VITE_DISABLE_MSW !== "true"
  ) {
    const { worker } = await import("./mocks/browser");
    return worker.start({ onUnhandledRequest: "bypass" });
  }
  if (isDemoMode()) {
    return startDemoWorker();
  }
}

enableMocking().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  );
});
