import { NavLink } from "react-router-dom";
import { LayoutGrid, BarChart2, Trash2 } from "lucide-react";

const tabs = [
  { to: "/", label: "Apps", icon: LayoutGrid },
  { to: "/dashboard", label: "Dashboard", icon: BarChart2 },
  { to: "/deleted", label: "Trash", icon: Trash2 },
] as const;

export function BottomNav() {
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden"
    >
      <div className="flex h-16 items-stretch">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`
            }
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
