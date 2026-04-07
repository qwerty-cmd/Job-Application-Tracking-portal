import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { to: "/", label: "Applications" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/deleted", label: "Trash" },
] as const;

export function NavBar() {
  const { user, logout, isDemoMode, exitDemo } = useAuth();

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold tracking-tight">
            Job Tracker
          </span>
          <Separator orientation="vertical" className="h-6" />
          <nav className="flex items-center gap-1">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {isDemoMode ? (
            <>
              <Badge
                variant="outline"
                className="border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
              >
                DEMO MODE
              </Badge>
              <Button variant="outline" size="sm" onClick={exitDemo}>
                Exit Demo
              </Button>
            </>
          ) : (
            <>
              {user && (
                <span className="text-sm text-muted-foreground">
                  {user.userDetails}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={logout}>
                Logout
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
