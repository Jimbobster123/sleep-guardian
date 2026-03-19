import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SleepGoalForm, { SleepGoalDraft } from "@/components/SleepGoalForm";
import { ApiError, apiJson } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut } from "lucide-react";

export default function Profile() {
  const { token, user, refreshMe, logout } = useAuth();
  const [first, setFirst] = useState(user?.first_name || "");
  const [last, setLast] = useState(user?.last_name || "");
  const [tz, setTz] = useState(user?.timezone || "");
  const [goal, setGoal] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [icsBusy, setIcsBusy] = useState(false);
   const [googleBusy, setGoogleBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
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

  useEffect(() => {
    const googleParam = searchParams.get("google");
    if (googleParam === "connected") {
      setMsg("Google Calendar connected.");
    }
  }, [searchParams]);

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

  const connectGoogle = async () => {
    if (!token) {
      setMsg("You must be logged in to connect Google Calendar.");
      return;
    }
    setGoogleBusy(true);
    setMsg(null);
    try {
      const res = await apiJson<{ url: string }>("/api/google/auth-url", { token });
      window.location.href = res.url;
    } catch (err: any) {
      setMsg(err?.message || "Failed to connect Google Calendar.");
    } finally {
      setGoogleBusy(false);
    }
  };

  const syncGoogle = async () => {
    if (!token) {
      setMsg("You must be logged in to sync Google Calendar.");
      return;
    }
    setGoogleBusy(true);
    setMsg(null);
    try {
      const res = await apiJson<{ imported: number }>("/api/google/sync", {
        method: "POST",
        token,
        body: JSON.stringify({}),
      });
      setMsg(`Synced ${res.imported} events from Google.`);
    } catch (err: any) {
      setMsg(err?.message || "Google sync failed.");
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Profile" compact />
      <div className="px-5 -mt-2 space-y-4 pb-6">
        {/* User / Log out (moved from Menu) */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
            <span className="text-sm font-semibold text-accent">
              {(user?.first_name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
              {(user?.last_name?.[0] || '').toUpperCase()}
            </span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Your account'}
            </p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <button onClick={logout} aria-label="Log out">
            <LogOut className="w-4.5 h-4.5 text-muted-foreground" />
          </button>
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
          <h2 className="text-sm font-semibold text-foreground mb-2">Google Calendar</h2>
          <p className="text-xs text-muted-foreground">
            Connect your Google Calendar for automatic sync of events between Luna and Google.
          </p>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <Button size="sm" onClick={connectGoogle} disabled={googleBusy}>
              {googleBusy ? "Connecting..." : "Connect Google Calendar"}
            </Button>
            <Button size="sm" variant="outline" onClick={syncGoogle} disabled={googleBusy}>
              {googleBusy ? "Syncing..." : "Sync from Google"}
            </Button>
          </div>
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

