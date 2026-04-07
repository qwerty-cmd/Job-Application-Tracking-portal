const DEMO_MODE_KEY = "demo_mode";

// Module-level state — survives across React renders within a single page load
let workerStarted = false;
let workerInstance: import("msw/browser").SetupWorker | null = null;

export function isDemoMode(): boolean {
  try {
    return sessionStorage.getItem(DEMO_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setDemoMode(active: boolean): void {
  try {
    if (active) {
      sessionStorage.setItem(DEMO_MODE_KEY, "true");
    } else {
      sessionStorage.removeItem(DEMO_MODE_KEY);
    }
  } catch {
    // sessionStorage unavailable (e.g., private browsing restrictions) — no-op
  }
}

export async function startDemoWorker(): Promise<void> {
  if (workerStarted) return;
  const { worker } = await import("../mocks/browser");
  workerInstance = worker;
  await worker.start({ onUnhandledRequest: "bypass" });
  workerStarted = true;
}

export function stopDemoWorker(): void {
  if (!workerStarted || !workerInstance) return;
  workerInstance.stop();
  workerInstance = null;
  workerStarted = false;
}
