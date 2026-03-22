import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { mockSummary } from "@/mocks/handlers";
import { renderWithProviders } from "@/test-utils";
import App from "@/App";

function renderDeleted() {
  window.history.pushState({}, "", "/deleted");
  return renderWithProviders(<App />);
}

describe("DeletedApplicationsPage", () => {
  it("renders the Recently Deleted heading", async () => {
    renderDeleted();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /recently deleted/i }),
      ).toBeInTheDocument();
    });
  });

  it("shows empty state when no deleted apps", async () => {
    // Default mock returns empty items
    renderDeleted();

    await waitFor(() => {
      expect(screen.getByText(/no deleted applications/i)).toBeInTheDocument();
    });
  });

  it("renders deleted applications when present", async () => {
    server.use(
      http.get("/api/applications/deleted", () => {
        return HttpResponse.json({
          data: {
            items: [
              {
                ...mockSummary,
                id: "del-1",
                company: "DeletedCorp",
                role: "Removed Role",
                status: "Rejected",
                deletedAt: "2026-03-19T09:00:00Z",
              },
            ],
          },
          error: null,
        });
      }),
    );

    renderDeleted();

    await waitFor(() => {
      // Card title uses middot entity: "DeletedCorp · Removed Role" — search within heading
      expect(
        screen.getByText((content) => content.includes("DeletedCorp")),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /restore/i }),
    ).toBeInTheDocument();
  });

  it("restores an application when clicking Restore", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/applications/deleted", () => {
        return HttpResponse.json({
          data: {
            items: [
              {
                ...mockSummary,
                id: "app-1",
                company: "RestoreCorp",
                deletedAt: "2026-03-19T09:00:00Z",
              },
            ],
          },
          error: null,
        });
      }),
      http.patch("/api/applications/:id/restore", ({ params }) => {
        return HttpResponse.json({
          data: { id: params.id, isDeleted: false, deletedAt: null },
          error: null,
        });
      }),
    );

    renderDeleted();

    await waitFor(() => {
      expect(
        screen.getByText((content) => content.includes("RestoreCorp")),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /restore/i }));

    // Toast should show success
    await waitFor(() => {
      expect(screen.getByText(/application restored/i)).toBeInTheDocument();
    });
  });

  it("shows description text about soft-deletion", async () => {
    renderDeleted();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /recently deleted/i }),
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/soft-deleted/i)).toBeInTheDocument();
  });

  it("shows error state when API fails", async () => {
    server.use(
      http.get("/api/applications/deleted", () => {
        return HttpResponse.json(
          {
            data: null,
            error: {
              code: "INTERNAL_ERROR",
              message: "Could not load deleted apps",
            },
          },
          { status: 500 },
        );
      }),
    );

    renderDeleted();

    await waitFor(() => {
      expect(
        screen.getByText("Could not load deleted apps"),
      ).toBeInTheDocument();
    });
  });
});
