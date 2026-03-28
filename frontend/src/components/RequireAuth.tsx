import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL, apiJson } from "@/lib/api";

function AuthLoadingShell({ detail }: { detail?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <p className="text-sm text-muted-foreground">{detail ?? "Loading…"}</p>
      <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
        If the screen stays blank, open the browser devtools Console for errors. Ensure the API is running
        (<span className="font-mono text-foreground">npm run dev:backend</span> from repo root). API:{" "}
        <span className="font-mono text-foreground break-all">
          {API_BASE_URL || "same origin /api (Vite → :5001)"}
        </span>
      </p>
    </div>
  );
}

export default function RequireAuth({
  children,
  requireSleepSetup = true,
}: {
  children: React.ReactNode;
  requireSleepSetup?: boolean;
}) {
  const { token, user, loading, refreshMe } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [checkedSleep, setCheckedSleep] = useState(false);
  const [sessionRefreshAttempted, setSessionRefreshAttempted] = useState(false);

  useEffect(() => {
    setSessionRefreshAttempted(false);
  }, [token]);

  useEffect(() => {
    if (loading) return;
    // If there's no token, the session is definitely invalid.
    if (!token) {
      nav("/login", { replace: true, state: { from: loc.pathname } });
      return;
    }
    // Token exists but `user` hasn't been loaded yet (or refresh failed).
    // Try refreshing the user once before redirecting.
    if (!user) {
      if (sessionRefreshAttempted) {
        nav("/login", { replace: true, state: { from: loc.pathname } });
        return;
      }
      setSessionRefreshAttempted(true);
      void refreshMe().catch(() => {
        nav("/login", { replace: true, state: { from: loc.pathname } });
      });
      return;
    }
    setSessionRefreshAttempted(false);
    if (!requireSleepSetup) {
      setCheckedSleep(true);
      return;
    }

    let cancelled = false;
    (async () => {
      const ctrl = new AbortController();
      const timeoutMs = 15000;
      const tid = window.setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await apiJson<{ goal: any }>("/api/me/sleep-goal", { token, signal: ctrl.signal });
        const configured = Boolean(res.goal && res.goal.goal_type);
        if (!configured && !cancelled) nav("/onboarding/sleep-goal", { replace: true });
      } catch {
        // ignore: allow app to render; sleep page can handle errors
      } finally {
        window.clearTimeout(tid);
        if (!cancelled) setCheckedSleep(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, token, user, nav, loc.pathname, requireSleepSetup, refreshMe, sessionRefreshAttempted]);

  if (loading) return <AuthLoadingShell detail="Checking your session…" />;
  if (!token) return <AuthLoadingShell detail="Redirecting to sign in…" />;
  if (!user) return <AuthLoadingShell detail="Checking your session…" />;
  if (requireSleepSetup && !checkedSleep) return <AuthLoadingShell detail="Loading your sleep goal…" />;
  return <>{children}</>;
}

