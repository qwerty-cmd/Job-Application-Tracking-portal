import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export function LoginPage() {
  const { login, isLoading, isOwner, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (isOwner) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  if (isAuthenticated && !isOwner) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Access Denied</h1>
          <p className="mt-2 text-muted-foreground">
            This app is private. You don&apos;t have the required permissions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Job Tracker</h1>
        <p className="mt-2 text-muted-foreground">
          Track your job search journey in one place.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Private app &middot; Owner only
        </p>
      </div>
      <Button size="lg" onClick={login}>
        Sign in with GitHub
      </Button>
    </div>
  );
}
