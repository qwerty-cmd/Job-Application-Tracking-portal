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

  // --- InterviewModal pre-population tests (T-8) ---

  it("opens edit modal with pre-populated interview data", async () => {
    const user = userEvent.setup();
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    // Click the edit button on the interview card
    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await user.click(editButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /edit interview/i }),
      ).toBeInTheDocument();
    });

    // Modal description should mention the round and type
    expect(
      screen.getByText(/editing round 1 \(phone screen\)/i),
    ).toBeInTheDocument();
  });

  it("shows 'Add Interview Round' title for new interview", async () => {
    const user = userEvent.setup();
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /add interview/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /add interview round/i }),
      ).toBeInTheDocument();
    });
  });

  // --- FileSection tests (T-2, T-3, T-4) ---

  it("shows file names for uploaded files", async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    // mock app has resume and cover letter
    expect(screen.getByText("contoso-resume.pdf")).toBeInTheDocument();
    expect(screen.getByText("contoso-cl.pdf")).toBeInTheDocument();
  });

  it("shows download button for uploaded files", async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    const downloadButtons = screen.getAllByRole("button", {
      name: /download/i,
    });
    // Resume and cover letter both have download buttons
    expect(downloadButtons.length).toBeGreaterThanOrEqual(2);
  });

  it("shows Remove button for uploaded files", async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    // Resume and cover letter both have remove buttons
    expect(removeButtons.length).toBeGreaterThanOrEqual(2);
  });

  it("shows Upload File button for file types with no upload", async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    // Job description has no file in the mock — should show upload button
    const uploadButtons = screen.getAllByRole("button", {
      name: /upload file/i,
    });
    expect(uploadButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("shows delete confirmation dialog when clicking Remove", async () => {
    const user = userEvent.setup();
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    // Click first Remove button (resume)
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await user.click(removeButtons[0]);

    // Confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByText(/remove file/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();

    // Cancel should close the dialog
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument();
    });
  });

  // --- Status change showing rejection (T-5) ---

  it("shows rejection details with reason select and notes", async () => {
    server.use(
      http.get("/api/applications/:id", () => {
        return HttpResponse.json({
          data: {
            ...mockApplication,
            status: "Rejected",
            rejection: {
              reason: "Failed Technical",
              notes: "System design was weak",
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

    // Rejection section label visible
    expect(screen.getByText(/rejection details/i)).toBeInTheDocument();

    // Reason label and notes label
    expect(screen.getByLabelText(/reason/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
  });

  it("shows Re-upload button for files that already have uploads", async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeInTheDocument();
    });

    const reuploadButtons = screen.getAllByRole("button", {
      name: /re-upload/i,
    });
    // Resume and cover letter both have re-upload buttons
    expect(reuploadButtons.length).toBeGreaterThanOrEqual(2);
  });
});
