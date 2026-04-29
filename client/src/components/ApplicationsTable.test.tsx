import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ApplicationsTable } from "./ApplicationsTable";
import type { ApplicationSummary, PaginationInfo } from "@/types";

const makeItem = (id: string, company: string): ApplicationSummary => ({
  id,
  company,
  role: "Engineer",
  location: null,
  dateApplied: "2024-03-15",
  status: "Applying",
  jobPostingUrl: null,
  hasResume: false,
  hasCoverLetter: false,
  hasJobDescription: false,
  interviewCount: 0,
  createdAt: "2024-03-15T10:00:00Z",
  updatedAt: "2024-03-15T10:00:00Z",
});

const defaultFilters = {
  sortBy: "dateApplied" as const,
  sortOrder: "desc" as const,
  page: 1,
  pageSize: 20,
};

const defaultPagination: PaginationInfo = {
  page: 1,
  pageSize: 20,
  totalItems: 2,
  totalPages: 1,
};

function renderTable(
  items: ApplicationSummary[],
  pagination: PaginationInfo = defaultPagination,
  onCreateClick?: () => void,
) {
  return render(
    <MemoryRouter>
      <ApplicationsTable
        items={items}
        pagination={pagination}
        filters={defaultFilters}
        onFiltersChange={() => {}}
        onCreateClick={onCreateClick}
      />
    </MemoryRouter>,
  );
}

describe("ApplicationsTable", () => {
  it("table container has class 'hidden md:block'", () => {
    const { container } = renderTable([makeItem("1", "Acme")]);
    const tableWrapper = container.querySelector(".hidden.md\\:block");
    expect(tableWrapper).toBeInTheDocument();
  });

  it("card list container has class 'block md:hidden'", () => {
    const { container } = renderTable([makeItem("1", "Acme")]);
    const cardWrapper = container.querySelector(".block.md\\:hidden");
    expect(cardWrapper).toBeInTheDocument();
  });

  it("card list renders the correct number of items", () => {
    const items = [makeItem("1", "Acme"), makeItem("2", "Globex")];
    renderTable(items);
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(2);
  });

  it("empty state renders when items array is empty", () => {
    renderTable([]);
    const matches = screen.getAllByText(/no applications/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("empty state shows New Application button when onCreateClick is provided", () => {
    renderTable([], { ...defaultPagination, totalItems: 0 }, () => {});
    const buttons = screen.getAllByRole("button", { name: /new application/i });
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("pagination renders when totalPages > 1", () => {
    const manyPages: PaginationInfo = { page: 1, pageSize: 20, totalItems: 50, totalPages: 3 };
    renderTable([makeItem("1", "Acme")], manyPages);
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });
});
