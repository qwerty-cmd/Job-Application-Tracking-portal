import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { ClientPrincipal, AuthMeResponse } from "@/types";

interface AuthContextValue {
  user: ClientPrincipal | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isOwner: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ClientPrincipal | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const res = await fetch("/.auth/me");
        if (!res.ok) {
          setUser(null);
          return;
        }
        const data: AuthMeResponse = await res.json();
        if (!cancelled) {
          setUser(data.clientPrincipal);
        }
      } catch {
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

  function login() {
    window.location.href = "/.auth/login/github?post_login_redirect_uri=/";
  }

  function logout() {
    window.location.href = "/.auth/logout?post_logout_redirect_uri=/login";
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated, isOwner, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
