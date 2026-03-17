import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SleepGoalForm, { SleepGoalDraft } from "@/components/SleepGoalForm";
import { ApiError, apiJson } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";

export default function Profile() {
  const { token, user, refreshMe, logout } = useAuth();
  const [first, setFirst] = useState(user?.first_name || "");
  const [last, setLast] = useState(user?.last_name || "");
  const [tz, setTz] = useState(user?.timezone || "");
  const [goal, setGoal] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [icsBusy, setIcsBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null);

  useEffect(() => {
    setFirst(user?.first_name || "");
    setLast(user?.last_name || "");
    setTz(user?.timezone || "");
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      const res = await apiJson("/api/me/sleep-goal", { token });
      if (!cancelled) setGoal(res);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const saveProfile = async () => {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiJson("/api/me/profile", {
        method: "PUT",
        token,
        body: JSON.stringify({ first_name: first, last_name: last, timezone: tz }),
      });
      await refreshMe();
      setMsg("Profile saved.");
    } finally {
      setBusy(false);
    }
  };

  const saveGoal = async (draft: SleepGoalDraft) => {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    setGoalError(null);
    try {
      const res = await apiJson("/api/me/sleep-goal", { method: "PUT", token, body: JSON.stringify(draft) });
      setGoal({ goal: res.goal, windows: res.windows });
      toast.success("Sleep goal saved.", { duration: 3000 });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save sleep goal.";
      setGoalError(message);
      toast.error(message, { duration: 3000 });
    } finally {
      setBusy(false);
    }
  };

  const importIcs = async (file: File) => {
    if (!token) return;
    setIcsBusy(true);
    setMsg(null);
    try {
      const text = await file.text();
      const res = await apiJson<{ imported: number }>("/api/me/calendar-import/ics", {
        method: "POST",
        token,
        headers: { "Content-Type": "text/calendar" },
        body: text,
      });
      setMsg(`Imported ${res.imported} events.`);
    } finally {
      setIcsBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Profile" compact />
      <div className="px-5 -mt-2 space-y-4 pb-6">
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">{user?.email}</p>
              <p className="text-xs text-muted-foreground">Account</p>
            </div>
            <Button variant="outline" onClick={logout}>
              Log out
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-3">Profile</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>First</Label>
              <Input value={first} onChange={(e) => setFirst(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Last</Label>
              <Input value={last} onChange={(e) => setLast(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Timezone</Label>
              <Input placeholder="America/Denver" value={tz} onChange={(e) => setTz(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <Button onClick={saveProfile} disabled={busy}>
              {busy ? "Saving..." : "Save profile"}
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-3">Sleep goal</h2>
          <SleepGoalForm
            initial={{
              goal_type: goal?.goal?.goal_type,
              target_sleep_minutes: goal?.goal?.target_sleep_minutes,
              target_bedtime: goal?.goal?.target_bedtime,
              target_wake_time: goal?.goal?.target_wake_time,
              bedtime_flex_minutes: goal?.goal?.bedtime_flex_minutes,
              windows: goal?.windows,
            }}
            onSubmit={saveGoal}
            submitLabel={busy ? "Saving..." : "Save sleep goal"}
            busy={busy}
            submitError={goalError}
          />
        </div>

        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-2">Import calendar</h2>
          <p className="text-xs text-muted-foreground">
            Export your Google Calendar as an <span className="font-medium">.ics</span> file and import it here.
          </p>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <input
              type="file"
              accept=".ics,text/calendar"
              disabled={icsBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importIcs(f);
                e.currentTarget.value = "";
              }}
            />
            <span className="text-xs text-muted-foreground">{icsBusy ? "Importing..." : ""}</span>
          </div>
        </div>

        {msg && <div className="text-sm text-foreground/80">{msg}</div>}
      </div>
    </div>
  );
}

