import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BottomNav } from "./BottomNav";

function renderBottomNav(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  it("renders the Applications link", () => {
    renderBottomNav();
    expect(screen.getByRole("link", { name: /apps/i })).toBeInTheDocument();
  });

  it("renders the Dashboard link", () => {
    renderBottomNav();
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
  });

  it("renders the Trash link", () => {
    renderBottomNav();
    expect(screen.getByRole("link", { name: /trash/i })).toBeInTheDocument();
  });

  it("Applications link points to /", () => {
    renderBottomNav();
    expect(screen.getByRole("link", { name: /apps/i })).toHaveAttribute("href", "/");
  });

  it("Dashboard link points to /dashboard", () => {
    renderBottomNav();
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/dashboard");
  });
});
