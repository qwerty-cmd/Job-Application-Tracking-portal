import { createContext } from "react";
import type { ClientPrincipal } from "@/types";

export interface AuthContextValue {
  user: ClientPrincipal | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isOwner: boolean;
  isDemoMode: boolean;
  login: () => void;
  logout: () => void;
  enterDemo: () => Promise<void>;
  exitDemo: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
