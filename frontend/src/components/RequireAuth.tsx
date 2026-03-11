import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { apiJson } from "@/lib/api";

export default function RequireAuth({
  children,
  requireSleepSetup = true,
}: {
  children: React.ReactNode;
  requireSleepSetup?: boolean;
}) {
  const { token, user, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [checkedSleep, setCheckedSleep] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!token || !user) {
      nav("/login", { replace: true, state: { from: loc.pathname } });
      return;
    }
    if (!requireSleepSetup) {
      setCheckedSleep(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await apiJson<{ goal: any }>("/api/me/sleep-goal", { token });
        const configured = Boolean(res.goal && res.goal.goal_type);
        if (!configured && !cancelled) nav("/onboarding/sleep-goal", { replace: true });
      } catch {
        // ignore: allow app to render; sleep page can handle errors
      } finally {
        if (!cancelled) setCheckedSleep(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, token, user, nav, loc.pathname, requireSleepSetup]);

  if (loading) return null;
  if (!token || !user) return null;
  if (requireSleepSetup && !checkedSleep) return null;
  return <>{children}</>;
}

