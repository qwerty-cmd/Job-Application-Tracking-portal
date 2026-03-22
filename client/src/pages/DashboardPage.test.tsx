import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test-utils";
import App from "@/App";

const fixedStats = {
  period: { from: "2026-03-01", to: "2026-03-18" },
  totalApplications: 5,
  byStatus: {
    Applying: 1,
    "Application Submitted": 1,
    "Recruiter Screening": 1,
    "Interview Stage": 1,
    "Pending Offer": 0,
    Accepted: 0,
    Rejected: 1,
    Withdrawn: 0,
  },
  totalInterviews: 2,
  interviewsByType: {
    "Phone Screen": 1,
    Technical: 1,
    Behavioral: 0,
    "Case Study": 0,
    Panel: 0,
    "Take Home Test": 0,
    Other: 0,
  },
  outcomesByStage: {
    "No Response": 2,
    "Pre-Interview": 0,
    "Phone Screen": 1,
    "Take Home Test": 0,
    Technical: 0,
    Behavioral: 0,
    "Case Study": 0,
    Panel: 0,
    Other: 0,
  },
};

function useFixedStats() {
  server.use(
    http.get("/api/applications/stats", () => {
      return HttpResponse.json({ data: fixedStats, error: null });
    }),
  );
}

function renderDashboard() {
  window.history.pushState({}, "", "/dashboard");
  return renderWithProviders(<App />);
}

describe("DashboardPage", () => {
  it("renders the dashboard heading", async () => {
    renderDashboard();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /dashboard/i }),
      ).toBeInTheDocument();
    });
  });

  it("shows loading state initially", async () => {
    server.use(
      http.get("/api/applications/stats", async () => {
        // Delay response so loading state is visible
        await new Promise((r) => setTimeout(r, 200));
        return HttpResponse.json({
          data: null,
          error: { code: "TIMEOUT", message: "Stats unavailable" },
        });
      }),
    );
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/loading dashboard/i)).toBeInTheDocument();
    });
  });

  it("displays summary cards with mock stats", async () => {
    useFixedStats();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Total Apps")).toBeInTheDocument();
    });

    // Mock stats: totalApplications = 5
    const totalAppsCard = screen
      .getByText("Total Apps")
      .closest("[class*='card']")!;
    expect(totalAppsCard).toHaveTextContent("5");
    expect(screen.getByText("Active")).toBeInTheDocument();
    // "Rejected" and "Accepted" appear in both summary cards and status chart.
    // Use getAllByText to verify at least one occurrence.
    expect(screen.getAllByText("Rejected").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Accepted").length).toBeGreaterThanOrEqual(1);
  });

  it("displays Applications by Status chart", async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Applications by Status")).toBeInTheDocument();
    });

    // All 8 statuses should appear
    expect(screen.getByText("Applying")).toBeInTheDocument();
    expect(screen.getByText("Application Submitted")).toBeInTheDocument();
    expect(screen.getByText("Interview Stage")).toBeInTheDocument();
  });

  it("displays Interview Pipeline chart", async () => {
    useFixedStats();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Interview Pipeline")).toBeInTheDocument();
    });

    // Mock stats: totalInterviews = 2
    expect(screen.getByText(/2 interviews conducted/i)).toBeInTheDocument();
    // Phone Screen appears in both Interview Pipeline and Dropoff chart
    expect(screen.getAllByText("Phone Screen").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getAllByText("Technical").length).toBeGreaterThanOrEqual(1);
  });

  it("displays Quick Insights section", async () => {
    useFixedStats();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Quick Insights")).toBeInTheDocument();
    });

    // Mock stats: 5 total, Applying=1 + Submitted=1 = 2 no response → 3 responded = 60%
    expect(screen.getByText(/response rate/i)).toBeInTheDocument();
    expect(
      screen.getByText(/total interviews conducted: 2/i),
    ).toBeInTheDocument();
  });

  it("shows date range inputs", async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Total Apps")).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/to/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument();
  });

  it("shows error state when API fails", async () => {
    server.use(
      http.get("/api/applications/stats", () => {
        return HttpResponse.json(
          {
            data: null,
            error: { code: "INTERNAL_ERROR", message: "Stats unavailable" },
          },
          { status: 500 },
        );
      }),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Stats unavailable")).toBeInTheDocument();
    });
  });
});
