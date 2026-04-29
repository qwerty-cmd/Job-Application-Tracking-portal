import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ApplicationCard } from "./ApplicationCard";
import type { ApplicationSummary } from "@/types";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const baseItem: ApplicationSummary = {
  id: "app-123",
  company: "Stripe Inc.",
  role: "Senior Software Engineer",
  location: { city: "London", country: "UK", workMode: "Remote", other: null },
  dateApplied: "2024-03-15",
  status: "Interview Stage",
  jobPostingUrl: null,
  hasResume: true,
  hasCoverLetter: false,
  hasJobDescription: false,
  interviewCount: 2,
  createdAt: "2024-03-15T10:00:00Z",
  updatedAt: "2024-03-20T10:00:00Z",
};

function renderCard(item: ApplicationSummary = baseItem) {
  return render(
    <MemoryRouter>
      <ApplicationCard item={item} />
    </MemoryRouter>,
  );
}

describe("ApplicationCard", () => {
  it("renders company name", () => {
    renderCard();
    expect(screen.getByText("Stripe Inc.")).toBeInTheDocument();
  });

  it("renders role", () => {
    renderCard();
    expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument();
  });

  it("renders status badge", () => {
    renderCard();
    // StatusBadge maps "Interview Stage" → label "Interview"
    expect(screen.getByText("Interview")).toBeInTheDocument();
  });

  it("renders dateApplied", () => {
    renderCard();
    expect(screen.getByText("2024-03-15")).toBeInTheDocument();
  });

  it("renders city and country when present", () => {
    renderCard();
    expect(screen.getByText(/London.*UK|UK.*London/)).toBeInTheDocument();
  });

  it("renders work mode when present", () => {
    renderCard();
    expect(screen.getByText("Remote")).toBeInTheDocument();
  });

  it("renders — for location when city and country are absent", () => {
    renderCard({ ...baseItem, location: null });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("clicking the card navigates to /applications/:id", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("article"));
    expect(mockNavigate).toHaveBeenCalledWith("/applications/app-123");
  });
});
