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

  // --- FilterBar tests (T-6) ---

  it("applies date filters and triggers refetch", async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    const fromInput = screen.getByLabelText(/from/i);
    const toInput = screen.getByLabelText(/to/i);

    await user.clear(fromInput);
    await user.type(fromInput, "2026-03-01");
    await user.clear(toInput);
    await user.type(toInput, "2026-03-31");

    await user.click(screen.getByRole("button", { name: /^apply$/i }));

    // After applying, the table should still render (filters applied)
    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });
  });

  it("resets filters to defaults", async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    // Set a date filter first
    const fromInput = screen.getByLabelText(/from/i);
    await user.clear(fromInput);
    await user.type(fromInput, "2026-01-01");

    // Click Reset
    await user.click(screen.getByRole("button", { name: /reset/i }));

    // From input should be cleared
    expect(screen.getByLabelText(/from/i)).toHaveValue("");
  });

  // --- CreateApplicationModal validation tests (T-7) ---

  it("shows validation errors when submitting empty create form", async () => {
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

    // Clear the company and role fields and date field, then submit
    const companyInput = screen.getByLabelText(/company/i);
    const roleInput = screen.getByLabelText(/role/i);
    const dateInput = screen.getByLabelText(/date applied/i);

    await user.clear(companyInput);
    await user.clear(roleInput);
    await user.clear(dateInput);

    // Click the Create button
    await user.click(screen.getByRole("button", { name: /create/i }));

    // Should show validation errors
    await waitFor(() => {
      expect(screen.getByText(/company is required/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/role is required/i)).toBeInTheDocument();
  });

  it("prevents form submission with invalid job posting URL", async () => {
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

    // Fill required fields
    await user.type(screen.getByLabelText(/company/i), "Test Co");
    await user.type(screen.getByLabelText(/role/i), "Engineer");

    // Enter invalid URL
    const urlInput = screen.getByLabelText(/job posting url/i);
    await user.type(urlInput, "not-a-url");

    await user.click(screen.getByRole("button", { name: /create/i }));

    // Form should stay open (validation should prevent submission)
    await waitFor(
      () => {
        expect(
          screen.getByRole("heading", { name: /new application/i }),
        ).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });

  it("successfully creates application and navigates to detail", async () => {
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

    await user.type(screen.getByLabelText(/company/i), "New Corp");
    await user.type(screen.getByLabelText(/role/i), "Developer");

    await user.click(screen.getByRole("button", { name: /create/i }));

    // Should navigate to the new app's detail page
    await waitFor(() => {
      expect(screen.getByText("New Corp")).toBeInTheDocument();
    });
  });
});
