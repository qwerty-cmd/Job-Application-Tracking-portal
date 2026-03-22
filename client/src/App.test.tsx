import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";
import App from "@/App";

describe("App", () => {
  it("renders the login page when not authenticated", async () => {
    // Override the /.auth/me handler to return unauthenticated
    const { server } = await import("@/mocks/server");
    const { http, HttpResponse } = await import("msw");
    server.use(
      http.get("/.auth/me", () => {
        return HttpResponse.json({ clientPrincipal: null });
      }),
    );

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /sign in with github/i }),
      ).toBeInTheDocument();
    });
  });

  it("renders the applications page when authenticated as owner", async () => {
    // Default MSW handler returns owner user
    renderWithProviders(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /applications/i }),
      ).toBeInTheDocument();
    });
  });

  it("shows navigation bar when authenticated", async () => {
    renderWithProviders(<App />);

    await waitFor(() => {
      expect(screen.getByText("Job Tracker")).toBeInTheDocument();
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Trash")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /logout/i }),
      ).toBeInTheDocument();
    });
  });
});
