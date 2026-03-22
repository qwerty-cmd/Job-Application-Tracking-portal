import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test-utils";
import App from "@/App";

// Helper: render App so routing is wired (Applications page is the "/" route)
function renderApp() {
  window.history.pushState({}, "", "/");
  return renderWithProviders(<App />);
}

describe("ApplicationsPage", () => {
  it("renders the applications heading", async () => {
    renderApp();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /applications/i }),
      ).toBeInTheDocument();
    });
  });

  it("shows loading state initially", async () => {
    server.use(
      http.get("/api/applications", async () => {
        // Delay response so loading state is visible
        await new Promise((r) => setTimeout(r, 200));
        return HttpResponse.json({
          data: {
            items: [],
            pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
          },
          error: null,
        });
      }),
    );
    renderApp();

    await waitFor(() => {
      expect(screen.getByText(/loading applications/i)).toBeInTheDocument();
    });
  });

  it("renders the application table with mock data", async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });
    expect(screen.getByText("Senior Cloud Engineer")).toBeInTheDocument();
  });

  it("shows the + New Application button", async () => {
    renderApp();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new application/i }),
      ).toBeInTheDocument();
    });
  });

  it("opens the create modal when clicking New Application", async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new application/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /new application/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /new application/i }),
      ).toBeInTheDocument();
    });
  });

  it("shows error state when API fails", async () => {
    server.use(
      http.get("/api/applications", () => {
        return HttpResponse.json(
          {
            data: null,
            error: { code: "INTERNAL_ERROR", message: "Server error" },
          },
          { status: 500 },
        );
      }),
    );

    renderApp();

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("shows filter bar with status filter", async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    // Filter bar labels
    expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/to/i)).toBeInTheDocument();
  });
});
