import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test-utils";
import App from "@/App";

function renderLoginPage() {
  window.history.pushState({}, "", "/login");
  return renderWithProviders(<App />);
}

describe("LoginPage", () => {
  it("shows loading state while auth is pending", async () => {
    // Delay the auth response so loading is visible
    server.use(
      http.get("/.auth/me", async () => {
        await new Promise((r) => setTimeout(r, 500));
        return HttpResponse.json({ clientPrincipal: null });
      }),
    );

    renderLoginPage();

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("redirects to applications when user is owner", async () => {
    // Default handler returns owner — App.tsx redirects /login to /
    renderLoginPage();

    await waitFor(() => {
      // Owner should be redirected away from login; applications page heading should appear
      expect(
        screen.getByRole("heading", { name: /applications/i }),
      ).toBeInTheDocument();
    });
  });

  it('shows "Access Denied" for authenticated non-owner user', async () => {
    server.use(
      http.get("/.auth/me", () => {
        return HttpResponse.json({
          clientPrincipal: {
            identityProvider: "github",
            userId: "other-user",
            userDetails: "otheruser",
            userRoles: ["authenticated"],
          },
        });
      }),
    );

    renderLoginPage();

    await waitFor(() => {
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/you don't have the required permissions/i),
    ).toBeInTheDocument();
  });

  it('shows "Sign in with GitHub" button for unauthenticated user', async () => {
    server.use(
      http.get("/.auth/me", () => {
        return HttpResponse.json({ clientPrincipal: null });
      }),
    );

    renderLoginPage();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /sign in with github/i }),
      ).toBeInTheDocument();
    });
  });

  it("shows app title and tagline for unauthenticated user", async () => {
    server.use(
      http.get("/.auth/me", () => {
        return HttpResponse.json({ clientPrincipal: null });
      }),
    );

    renderLoginPage();

    await waitFor(() => {
      expect(screen.getByText("Job Tracker")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/track your job search journey/i),
    ).toBeInTheDocument();
  });

  it("redirects unauthenticated user from protected route to login", async () => {
    server.use(
      http.get("/.auth/me", () => {
        return HttpResponse.json({ clientPrincipal: null });
      }),
    );

    // Try to visit a protected route
    window.history.pushState({}, "", "/");
    renderWithProviders(<App />);

    await waitFor(() => {
      // Should be on login page since not authenticated => ProtectedRoute redirects to /login
      expect(
        screen.getByRole("button", { name: /sign in with github/i }),
      ).toBeInTheDocument();
    });
  });
});
