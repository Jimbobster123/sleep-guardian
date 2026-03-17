import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, apiJson } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import SleepGoalForm, { SleepGoalDraft } from "@/components/SleepGoalForm";
import { toast } from "@/components/ui/sonner";

export default function OnboardingSleepGoal() {
  const { token } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [initial, setInitial] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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
      await apiJson("/api/me/sleep-goal", { method: "PUT", token, body: JSON.stringify(draft) });
      toast.success("Sleep goal saved.", { duration: 3000 });
      nav("/", { replace: true });
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
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Set your sleep goal</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Required: pick whether you want to lock a bedtime, lock a wake time, or require a sleep amount. You can set different times per day.
        </p>

        <div className="mt-6">
          <SleepGoalForm
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

