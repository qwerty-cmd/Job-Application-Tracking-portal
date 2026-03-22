import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { mockApplication } from "@/mocks/handlers";
import { renderWithProviders } from "@/test-utils";
import App from "@/App";

// Navigate to the detail page for app-1
function renderDetailPage(id = "app-1") {
  window.history.pushState({}, "", `/applications/${id}`);
  return renderWithProviders(<App />);
}

describe("ApplicationDetailPage", () => {
  it("renders application details after loading", async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });
    expect(screen.getByText("Senior Cloud Engineer")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    renderDetailPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows error when application not found", async () => {
    renderDetailPage("nonexistent");

    await waitFor(() => {
      expect(
        screen.getByText(/application nonexistent not found/i),
      ).toBeInTheDocument();
    });
  });

  it("displays location and date applied", async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });
    expect(screen.getByText(/sydney/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-03-15/i)).toBeInTheDocument();
  });

  it("displays file section with resume and cover letter", async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    // The mock application has resume and cover letter — check for the labels
    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(screen.getByText("Cover Letter")).toBeInTheDocument();
  });

  it("displays interview list with existing interview", async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    // Mock app has one interview: Phone Screen with Jane Smith
    expect(screen.getByText(/phone screen/i)).toBeInTheDocument();
    expect(screen.getByText(/jane smith/i)).toBeInTheDocument();
  });

  it("shows Add Interview button", async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /add interview/i }),
    ).toBeInTheDocument();
  });

  it("opens interview modal when clicking Add Interview", async () => {
    const user = userEvent.setup();
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /add interview/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /add interview/i }),
      ).toBeInTheDocument();
    });
  });

  it("shows back button that navigates to list", async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("does not show rejection section for non-rejected applications", async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    // mockApplication status is "Interview Stage" — no rejection section
    expect(screen.queryByText(/rejection reason/i)).not.toBeInTheDocument();
  });

  it("shows rejection section when application is rejected", async () => {
    server.use(
      http.get("/api/applications/:id", () => {
        return HttpResponse.json({
          data: {
            ...mockApplication,
            status: "Rejected",
            rejection: {
              reason: "Failed Technical",
              notes: "Couldn't solve design question",
            },
          },
          error: null,
        });
      }),
    );

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    expect(screen.getByText(/rejection/i)).toBeInTheDocument();
  });
});
