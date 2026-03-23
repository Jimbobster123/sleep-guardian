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
import { useApp } from "@/contexts/AppContext";
import { useTheme } from "@/contexts/ThemeContext";
import { LogOut, Zap, Sun, Moon } from "lucide-react";
import { LogOut } from "lucide-react";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";

export default function Profile() {
  const { token, user, refreshMe, logout } = useAuth();
  const { crisisMode, setCrisisMode } = useApp();
  const { theme, toggleTheme } = useTheme();
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

  const saveAll = async () => {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    setGoalError(null);
    let formWillHandleBusy = false;
    try {
      await apiJson("/api/me/profile", {
        method: "PUT",
        token,
        body: JSON.stringify({ first_name: first, last_name: last, timezone: tz }),
      });
      await refreshMe();
      const form = document.getElementById("profile-sleep-goal-form") as HTMLFormElement;
      if (form) {
        form.requestSubmit();
        formWillHandleBusy = true;
      } else {
        toast.success("Saved.", { duration: 3000 });
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save.";
      toast.error(message, { duration: 3000 });
    } finally {
      if (!formWillHandleBusy) setBusy(false);
    }
  };

  const saveGoal = async (draft: SleepGoalDraft) => {
    if (!token) return;
    setBusy(true);
    setGoalError(null);
    try {
      const res = await apiJson("/api/me/sleep-goal", { method: "PUT", token, body: JSON.stringify(draft) });
      setGoal({ goal: res.goal, windows: res.windows });
      toast.success("Saved.", { duration: 3000 });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save.";
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
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50 flex items-center gap-3 overflow-visible">
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
          <button
            onClick={logout}
            aria-label="Log out"
            className="group relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <LogOut className="w-4.5 h-4.5 text-muted-foreground" />
            <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              Logout
            </span>
          </button>
        </div>

        {/* Crisis Mode */}
        <div
          className={`rounded-xl p-4 border shadow-sm ${
            crisisMode ? 'bg-crisis-light border-crisis/30 crisis-glow' : 'bg-card border-border/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  crisisMode ? 'bg-crisis/10' : 'bg-muted'
                }`}
              >
                <Zap className={`w-5 h-5 ${crisisMode ? 'text-warning' : 'text-sleep'}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Crisis / Exam Mode</p>
                <p className="text-xs text-muted-foreground">
                  {crisisMode ? 'Active — strategic recovery focus' : 'For exams, deadlines, INTEX weeks'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setCrisisMode(!crisisMode)}
              className={`relative w-12 h-7 rounded-full transition-colors ${crisisMode ? 'bg-crisis' : 'bg-muted'}`}
            >
              <div
                className={`absolute top-1 w-5 h-5 rounded-full bg-card shadow transition-transform ${
                  crisisMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {crisisMode && (
            <div className="mt-3 text-xs text-foreground/80 space-y-1">
              <p>• Goal shifts to "mitigate damage"</p>
              <p>• Power nap & 90-min cycle suggestions enabled</p>
              <p>• Streak penalties relaxed</p>
            </div>
          )}
        </div>

        {/* Dark Mode */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                {theme === 'dark' ? (
                  <Sun className="w-5 h-5 text-warning" />
                ) : (
                  <Moon className="w-5 h-5 text-sleep" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Dark Mode</p>
                <p className="text-xs text-muted-foreground">{theme === 'dark' ? 'Night theme active' : 'Switch to night theme'}</p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative w-12 h-7 rounded-full transition-colors ${theme === 'dark' ? 'bg-accent' : 'bg-muted'}`}
            >
              <div
                className={`absolute top-1 w-5 h-5 rounded-full bg-card shadow transition-transform ${
                  theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Quick Adjustments */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <p className="text-sm font-semibold text-foreground mb-2">Quick Adjustments</p>
          <div className="flex gap-2 flex-wrap">
            {['Late night', 'Early morning', 'Traveling', 'Sick'].map((label) => (
              <button
                key={label}
                className="text-xs bg-muted text-foreground rounded-full px-3 py-1.5 hover:bg-accent/10 hover:text-accent transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">The app will adjust intelligently without breaking your streak.</p>
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
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={tz}
                onChange={(e) => setTz(e.target.value)}
              >
                {tz && !TIMEZONE_OPTIONS.some((o) => o.value === tz) && (
                  <option value={tz}>{tz}</option>
                )}
                {TIMEZONE_OPTIONS.map((opt) => (
                  <option key={opt.value || "empty"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-3">Sleep goal</h2>
          <SleepGoalForm
            formId="profile-sleep-goal-form"
            hideSubmitButton
            initial={{
              goal_type: goal?.goal?.goal_type,
              target_sleep_minutes: goal?.goal?.target_sleep_minutes,
              target_bedtime: goal?.goal?.target_bedtime,
              target_wake_time: goal?.goal?.target_wake_time,
              bedtime_flex_minutes: goal?.goal?.bedtime_flex_minutes,
              windows: goal?.windows,
            }}
            onSubmit={saveGoal}
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

        <div className="flex justify-center pt-4">
          <Button onClick={saveAll} disabled={busy} size="lg" className="min-w-[140px]">
            {busy ? "Saving..." : "Save"}
          </Button>
        </div>

        {msg && <div className="text-sm text-foreground/80">{msg}</div>}
      </div>
    </div>
  );
}

