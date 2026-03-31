import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, apiJson } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import SleepGoalForm, { SleepGoalDraft } from "@/components/SleepGoalForm";
import { toast } from "@/components/ui/sonner";
import { Label } from "@/components/ui/label";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";

export default function OnboardingSleepGoal() {
  const { token, user, refreshMe } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [initial, setInitial] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState(user?.timezone || "");

  useEffect(() => {
    setTimezone(user?.timezone || "");
  }, [user?.timezone]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      try {
        const res = await apiJson("/api/me/sleep-goal", { token });
        if (!cancelled) setInitial(res);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const save = async (draft: SleepGoalDraft) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      if (timezone.trim()) {
        await apiJson("/api/me/profile", {
          method: "PUT",
          token,
          body: JSON.stringify({ timezone: timezone.trim() }),
        });
        await refreshMe();
      }
      await apiJson("/api/me/sleep-goal", { method: "PUT", token, body: JSON.stringify(draft) });
      toast.success("Sleep goal saved.", { duration: 3000 });
      nav("/home", { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save sleep goal.";
      setError(message);
      toast.error(message, { duration: 3000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10 flex justify-center">
      <div className="w-full max-w-3xl">
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Set your sleep goal</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
            Tell Luna how you like to sleep: choose either a consistent sleep window or a target amount of sleep, then
            pick the times that work best for your week.
          </p>
        </div>

        <div className="mt-8 max-w-xl mx-auto space-y-6">
          <div className="space-y-1">
            <Label htmlFor="tz">Timezone (optional)</Label>
            <select
              id="tz"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {timezone && !TIMEZONE_OPTIONS.some((o) => o.value === timezone) && (
                <option value={timezone}>{timezone}</option>
              )}
              {TIMEZONE_OPTIONS.map((opt) => (
                <option key={opt.value || "empty"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <SleepGoalForm
            centerSubmit
            initial={{
              goal_type: initial?.goal?.goal_type,
              target_sleep_minutes: initial?.goal?.target_sleep_minutes,
              target_bedtime: initial?.goal?.target_bedtime,
              target_wake_time: initial?.goal?.target_wake_time,
              bedtime_flex_minutes: initial?.goal?.bedtime_flex_minutes,
              windows: initial?.windows,
            }}
            onSubmit={save}
            submitLabel={busy ? "Saving..." : "Save & continue"}
            busy={busy}
            submitError={error}
          />
        </div>
      </div>
    </div>
  );
}

