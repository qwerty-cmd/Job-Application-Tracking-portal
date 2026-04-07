import { useEffect, useState, type ReactNode } from "react";
import type { ClientPrincipal, AuthMeResponse } from "@/types";
import { logger } from "@/lib/logger";
import { invalidatePrincipalCache } from "@/lib/api";
import { setDemoMode, startDemoWorker, stopDemoWorker } from "@/lib/demoMode";
import { AuthContext } from "./AuthContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ClientPrincipal | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const res = await fetch("/.auth/me");
        if (!res.ok) {
          logger.warn("Auth check failed", { status: res.status });
          setUser(null);
          return;
        }
        const data: AuthMeResponse = await res.json();
        if (!cancelled) {
          invalidatePrincipalCache();
          setUser(data.clientPrincipal);
          if (data.clientPrincipal) {
            logger.info("Auth session restored", {
              userId: data.clientPrincipal.userId,
              identityProvider: data.clientPrincipal.identityProvider,
              hasOwnerRole: data.clientPrincipal.userRoles.includes("owner"),
            });
            logger.event("SessionStarted", {
              userId: data.clientPrincipal.userId,
              identityProvider: data.clientPrincipal.identityProvider,
            });
          }
        }
      } catch (err) {
        logger.error("Auth check threw exception", {
          message: err instanceof Error ? err.message : "Unknown error",
        });
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  const isAuthenticated = user !== null;
  const isOwner = user?.userRoles.includes("owner") ?? false;
  const demoMode = user?.identityProvider === "demo";

  function login() {
    invalidatePrincipalCache();
    window.location.href = "/.auth/login/github?post_login_redirect_uri=/";
  }

  function logout() {
    invalidatePrincipalCache();
    window.location.href = "/.auth/logout?post_logout_redirect_uri=/login";
  }

  async function enterDemo(): Promise<void> {
    await startDemoWorker();
    setDemoMode(true);
    invalidatePrincipalCache();
    setUser({
      identityProvider: "demo",
      userId: "demo-user",
      userDetails: "Demo Visitor",
      userRoles: ["authenticated", "owner"],
    });
  }

  function exitDemo(): void {
    stopDemoWorker();
    setDemoMode(false);
    invalidatePrincipalCache();
    window.location.href = "/login";
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        isOwner,
        isDemoMode: demoMode,
        login,
        logout,
        enterDemo,
        exitDemo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
