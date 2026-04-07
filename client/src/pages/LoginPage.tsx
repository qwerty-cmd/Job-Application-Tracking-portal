import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export function LoginPage() {
  const { login, isLoading, isOwner, isAuthenticated, enterDemo } = useAuth();
  const navigate = useNavigate();
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  async function handleTryDemo() {
    setIsDemoLoading(true);
    try {
      await enterDemo();
      navigate("/");
    } finally {
      setIsDemoLoading(false);
    }
  }

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
        <button
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          onClick={handleTryDemo}
          disabled={isDemoLoading}
        >
          {isDemoLoading ? "Starting demo…" : "Try Demo instead"}
        </button>
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
      <div className="flex flex-col items-center gap-3">
        <Button size="lg" onClick={login}>
          Sign in with GitHub
        </Button>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px w-16 bg-border" />
          or
          <span className="h-px w-16 bg-border" />
        </div>
        <Button
          size="lg"
          variant="outline"
          onClick={handleTryDemo}
          disabled={isDemoLoading}
        >
          {isDemoLoading ? "Starting demo…" : "Try the Demo"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Explore with sample data. No account needed.
        </p>
      </div>
    </div>
  );
}
