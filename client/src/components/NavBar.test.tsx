import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NavBar } from "./NavBar";
import * as AuthContextModule from "@/hooks/useAuth";
import type { ClientPrincipal } from "@/types";

const baseUser: ClientPrincipal = {
  identityProvider: "github",
  userId: "test-user",
  userDetails: "testuser",
  userRoles: ["authenticated", "owner"],
};

function renderNavBar() {
  return render(
    <MemoryRouter>
      <NavBar />
    </MemoryRouter>,
  );
}

function mockAuth(overrides: Partial<ReturnType<typeof AuthContextModule.useAuth>>) {
  vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
    user: baseUser,
    isLoading: false,
    isAuthenticated: true,
    isOwner: true,
    isDemoMode: false,
    login: vi.fn(),
    logout: vi.fn(),
    enterDemo: vi.fn(),
    exitDemo: vi.fn(),
    ...overrides,
  });
}

describe("NavBar", () => {
  it("shows username and Logout button when not in demo mode", () => {
    mockAuth({ isDemoMode: false });
    renderNavBar();

    expect(screen.getByText("testuser")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
    expect(screen.queryByText("DEMO MODE")).not.toBeInTheDocument();
  });

  it("shows DEMO MODE badge when isDemoMode is true", () => {
    mockAuth({ isDemoMode: true });
    renderNavBar();

    expect(screen.getByText("DEMO MODE")).toBeInTheDocument();
  });

  it("shows Exit Demo button when isDemoMode is true", () => {
    mockAuth({ isDemoMode: true });
    renderNavBar();

    expect(
      screen.getByRole("button", { name: /exit demo/i }),
    ).toBeInTheDocument();
  });

  it("does not show Logout button in demo mode", () => {
    mockAuth({ isDemoMode: true });
    renderNavBar();

    expect(
      screen.queryByRole("button", { name: /logout/i }),
    ).not.toBeInTheDocument();
  });

  it("calls exitDemo when Exit Demo button is clicked", async () => {
    const exitDemo = vi.fn();
    mockAuth({ isDemoMode: true, exitDemo });
    renderNavBar();

    await userEvent.click(screen.getByRole("button", { name: /exit demo/i }));

    expect(exitDemo).toHaveBeenCalledOnce();
  });
});
