import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SleepGoalForm, { SleepGoalDraft } from "@/components/SleepGoalForm";
import { ApiError, apiJson } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { useSleepCheckIn } from "@/contexts/SleepCheckInContext";
import { useTheme } from "@/contexts/ThemeContext";
import { LogOut, Zap, Sun, Moon, ClipboardList } from "lucide-react";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";

type SleepGoalResponse = {
  goal?: {
    goal_type?: SleepGoalDraft["goal_type"];
    target_sleep_minutes?: number | null;
    target_bedtime?: string | null;
    target_wake_time?: string | null;
    bedtime_flex_minutes?: number | null;
  } | null;
  windows?: SleepGoalDraft["windows"];
};

type ReminderMethod = "email" | "text_message";

type ReminderSettingsResponse = {
  email: string;
  phone_number: string;
  reminder: {
    reminder_id?: string | null;
    type: "bedtime";
    method: ReminderMethod;
    minutes_before_bedtime: number;
    enabled: boolean;
    created_at?: string | null;
    last_sent_at?: string | null;
  };
};

type ReminderDraft = {
  method: ReminderMethod;
  minutes_before_bedtime: number;
  enabled: boolean;
};

type OnboardingOKR = {
  percentage: number;
  numerator_count: number;
  denominator_count: number;
  interval_days: number;
};

const TEXT_REMINDERS_AVAILABLE = false;

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

export default function Profile() {
  const { token, user, refreshMe, logout } = useAuth();
  const { openModal: openSleepCheckIn } = useSleepCheckIn();
  const { crisisMode, setCrisisMode } = useApp();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState(user?.email || "");
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || "");
  const [first, setFirst] = useState(user?.first_name || "");
  const [last, setLast] = useState(user?.last_name || "");
  const [tz, setTz] = useState(user?.timezone || "");
  const [goal, setGoal] = useState<SleepGoalResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [icsBusy, setIcsBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [goalError, setGoalError] = useState<string | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [reminderMethod, setReminderMethod] = useState<ReminderMethod>("email");
  const [reminderMinutes, setReminderMinutes] = useState("30");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderInitial, setReminderInitial] = useState<ReminderDraft | null>(null);
  const [onboardingOkr, setOnboardingOkr] = useState<OnboardingOKR | null>(null);
  const [loadingOkr, setLoadingOkr] = useState(true);
  const [okrError, setOkrError] = useState<string | null>(null);

  useEffect(() => {
    setEmail(user?.email || "");
    setPhoneNumber(user?.phone_number || "");
    setFirst(user?.first_name || "");
    setLast(user?.last_name || "");
    setTz(user?.timezone || "");
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      try {
        const res = await apiJson<SleepGoalResponse>("/api/me/sleep-goal", { token });
        if (!cancelled) setGoal(res);
      } catch (err) {
        if (!cancelled) {
          toast.error(getErrorMessage(err, "Failed to load sleep goal."));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) {
      setOnboardingOkr(null);
      setLoadingOkr(false);
      setOkrError(null);
      return;
    }
    let cancelled = false;
    setLoadingOkr(true);
    setOkrError(null);
    const loadOkr = async () => {
      try {
        const data = await apiJson<OnboardingOKR>("/api/okr/onboarding-sleep-goal-reminder-7d", { token });
        if (cancelled) return;
        setOnboardingOkr(data);
        setOkrError(null);
      } catch (err) {
        if (cancelled) return;
        setOkrError(err instanceof Error ? err.message : "Failed to load OKR");
      } finally {
        if (!cancelled) setLoadingOkr(false);
      }
    };
    void loadOkr();
    const intervalId = window.setInterval(() => void loadOkr(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      try {
        const res = await apiJson<ReminderSettingsResponse>("/api/me/bedtime-reminder", { token });
        if (cancelled) return;
        const nextDraft: ReminderDraft = {
          method: res.reminder.method || "email",
          minutes_before_bedtime: Number(res.reminder.minutes_before_bedtime ?? 30),
          enabled: Boolean(res.reminder.enabled),
        };
        setEmail(res.email || user?.email || "");
        setPhoneNumber(res.phone_number || user?.phone_number || "");
        setReminderMethod(nextDraft.method);
        setReminderMinutes(String(nextDraft.minutes_before_bedtime));
        setReminderEnabled(nextDraft.enabled);
        setReminderInitial(nextDraft);
        setReminderError(null);
      } catch (err) {
        if (cancelled) return;
        const nextDraft: ReminderDraft = {
          method: "email",
          minutes_before_bedtime: 30,
          enabled: false,
        };
        setReminderMethod(nextDraft.method);
        setReminderMinutes(String(nextDraft.minutes_before_bedtime));
        setReminderEnabled(nextDraft.enabled);
        setReminderInitial(nextDraft);
        setReminderError(getErrorMessage(err, "Failed to load bedtime reminder settings."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user?.email, user?.phone_number]);

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
        body: JSON.stringify({ email, first_name: first, last_name: last, phone_number: phoneNumber, timezone: tz }),
      });
      await refreshMe();
      const form = document.getElementById("profile-sleep-goal-form") as HTMLFormElement | null;
      if (form) {
        form.requestSubmit();
        formWillHandleBusy = true;
      } else {
        toast.success("Saved.", { duration: 3000 });
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save."), { duration: 3000 });
    } finally {
      if (!formWillHandleBusy) setBusy(false);
    }
  };

  const saveGoal = async (draft: SleepGoalDraft) => {
    if (!token) return;
    setBusy(true);
    setGoalError(null);
    try {
      const res = await apiJson<SleepGoalResponse>("/api/me/sleep-goal", {
        method: "PUT",
        token,
        body: JSON.stringify(draft),
      });
      setGoal({ goal: res.goal, windows: res.windows });
      toast.success("Saved.", { duration: 3000 });
    } catch (err) {
      const message = getErrorMessage(err, "Failed to save.");
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
    } catch (err) {
      setMsg(getErrorMessage(err, "Failed to connect Google Calendar."));
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
    } catch (err) {
      setMsg(getErrorMessage(err, "Google sync failed."));
    } finally {
      setGoogleBusy(false);
    }
  };

  const currentReminderDraft = useMemo<ReminderDraft>(
    () => ({
      method: reminderMethod,
      minutes_before_bedtime: Math.max(0, Math.round(Number(reminderMinutes) || 0)),
      enabled: reminderEnabled,
    }),
    [reminderMethod, reminderMinutes, reminderEnabled]
  );

  const reminderHasChanges = useMemo(() => {
    if (!reminderInitial) return false;
    return (
      reminderInitial.method !== currentReminderDraft.method ||
      reminderInitial.minutes_before_bedtime !== currentReminderDraft.minutes_before_bedtime ||
      reminderInitial.enabled !== currentReminderDraft.enabled
    );
  }, [currentReminderDraft, reminderInitial]);

  const saveReminder = async () => {
    if (!token) return;
    setReminderBusy(true);
    setReminderError(null);
    try {
      const res = await apiJson<ReminderSettingsResponse>("/api/me/bedtime-reminder", {
        method: "PUT",
        token,
        body: JSON.stringify(currentReminderDraft),
      });
      const nextDraft: ReminderDraft = {
        method: res.reminder.method,
        minutes_before_bedtime: Number(res.reminder.minutes_before_bedtime ?? 30),
        enabled: Boolean(res.reminder.enabled),
      };
      setReminderMethod(nextDraft.method);
      setReminderMinutes(String(nextDraft.minutes_before_bedtime));
      setReminderEnabled(nextDraft.enabled);
      setReminderInitial(nextDraft);
      await refreshMe();
      toast.success("Bedtime reminder settings saved.", { duration: 3000 });
    } catch (err) {
      const message = getErrorMessage(err, "Failed to save bedtime reminder settings.");
      setReminderError(message);
      toast.error(message, { duration: 3000 });
    } finally {
      setReminderBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Profile" compact />
      <div className="px-5 -mt-2 space-y-4 pb-6">
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50 flex items-center gap-3 overflow-visible">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
            <span className="text-sm font-semibold text-accent">
              {(user?.first_name?.[0] || user?.email?.[0] || "U").toUpperCase()}
              {(user?.last_name?.[0] || "").toUpperCase()}
            </span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {[user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Your account"}
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

        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-2">Morning sleep log</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Log how last night went — quality, time in bed, and what affected sleep. This updates your home
            suggestions.
          </p>
          <Button type="button" variant="default" size="sm" className="gap-2" onClick={() => openSleepCheckIn()}>
            <ClipboardList className="w-4 h-4" />
            Open sleep log
          </Button>
        </div>

        <div
          className={`rounded-xl p-4 border shadow-sm ${
            crisisMode ? "bg-crisis-light border-crisis/30 crisis-glow" : "bg-card border-border/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  crisisMode ? "bg-crisis/10" : "bg-muted"
                }`}
              >
                <Zap className={`w-5 h-5 ${crisisMode ? "text-warning" : "text-sleep"}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Crisis / Exam Mode</p>
                <p className="text-xs text-muted-foreground">
                  {crisisMode ? "Active - strategic recovery focus" : "For exams, deadlines, INTEX weeks"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setCrisisMode(!crisisMode)}
              className={`relative w-12 h-7 rounded-full transition-colors ${crisisMode ? "bg-crisis" : "bg-muted"}`}
            >
              <div
                className={`absolute top-1 w-5 h-5 rounded-full bg-card shadow transition-transform ${
                  crisisMode ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          {crisisMode && (
            <div className="mt-3 text-xs text-foreground/80 space-y-1">
              <p>- Goal shifts to "mitigate damage"</p>
              <p>- Power nap and 90-minute cycle suggestions enabled</p>
              <p>- Streak penalties relaxed</p>
            </div>
          )}
        </div>

        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                {theme === "dark" ? (
                  <Sun className="w-5 h-5 text-warning" />
                ) : (
                  <Moon className="w-5 h-5 text-sleep" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Dark Mode</p>
                <p className="text-xs text-muted-foreground">
                  {theme === "dark" ? "Night theme active" : "Switch to night theme"}
                </p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative w-12 h-7 rounded-full transition-colors ${theme === "dark" ? "bg-accent" : "bg-muted"}`}
            >
              <div
                className={`absolute top-1 w-5 h-5 rounded-full bg-card shadow transition-transform ${
                  theme === "dark" ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <p className="text-sm font-semibold text-foreground mb-2">Quick Adjustments</p>
          <div className="flex gap-2 flex-wrap">
            {["Late night", "Early morning", "Traveling", "Sick"].map((label) => (
              <button
                key={label}
                type="button"
                className="text-xs bg-muted text-foreground rounded-full px-3 py-1.5 hover:bg-accent/10 hover:text-accent transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            The app will adjust intelligently without breaking your streak.
          </p>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-3">Profile</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Email Address</Label>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Used for login and optional bedtime reminder emails.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Phone Number</Label>
              <Input
                type="tel"
                autoComplete="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 555 123 4567"
              />
              <p className="text-[11px] text-muted-foreground">
                Optional. Only used if you want bedtime reminders by text message.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="profile-first-name">First</Label>
              <Input id="profile-first-name" value={first} onChange={(e) => setFirst(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="profile-last-name">Last</Label>
              <Input id="profile-last-name" value={last} onChange={(e) => setLast(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="profile-timezone">Timezone</Label>
              <select
                id="profile-timezone"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={tz}
                onChange={(e) => setTz(e.target.value)}
              >
                {tz && !TIMEZONE_OPTIONS.some((o) => o.value === tz) && <option value={tz}>{tz}</option>}
                {TIMEZONE_OPTIONS.map((opt) => (
                  <option key={opt.value || "empty"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={saveAll} disabled={busy}>
              {busy ? "Saving..." : "Save Profile"}
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Bedtime Reminder</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Choose how to be reminded before your bedtime goal.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {reminderEnabled ? "Enabled" : "Disabled"}
              </span>
              <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 mt-4">
            <div className="space-y-1">
              <Label>Reminder Method</Label>
              <Select
                value={reminderMethod}
                onValueChange={(value: ReminderMethod) => setReminderMethod(value)}
                disabled={!reminderEnabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="text_message" disabled={!TEXT_REMINDERS_AVAILABLE}>
                    Text Message (Coming Soon)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Minutes Before Bedtime</Label>
              <Input
                type="number"
                min="0"
                max="1440"
                step="1"
                value={reminderMinutes}
                onChange={(e) => setReminderMinutes(e.target.value)}
                disabled={!reminderEnabled}
              />
            </div>
          </div>

          {!reminderEnabled ? (
            <p className="text-[11px] text-muted-foreground mt-3">
              Enable bedtime reminders to choose email or text delivery.
            </p>
          ) : !TEXT_REMINDERS_AVAILABLE ? (
            <p className="text-[11px] text-muted-foreground mt-3">
              Text message reminders are disabled for now. Email reminders are available.
            </p>
          ) : reminderMethod === "email" ? (
            <p className="text-[11px] text-muted-foreground mt-3">
              Email reminders will be sent to the address above.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-3">
              Text reminders will be sent to the phone number above.
            </p>
          )}

          {reminderError ? <p className="text-xs text-red-500 mt-3">{reminderError}</p> : null}

          <div className="flex justify-end pt-4">
            <Button onClick={saveReminder} disabled={reminderBusy || !reminderHasChanges}>
              {reminderBusy ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">OKR: Sleep setup</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Objective: reduce the burden of managing schedules around sleep
              </p>
              <p className="text-xs text-muted-foreground">Target: 80%</p>
            </div>
            <div className="text-right shrink-0">
              {loadingOkr || !onboardingOkr ? (
                <p className="text-2xl font-display font-bold text-foreground">—</p>
              ) : (
                <p className="text-2xl font-display font-bold text-foreground">
                  {Math.round(onboardingOkr.percentage)}%
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                first {onboardingOkr?.interval_days ?? 7} days
              </p>
            </div>
          </div>
          {okrError ? <p className="text-xs text-red-500 mt-2">{okrError}</p> : null}
          {onboardingOkr ? (
            <p className="text-xs text-muted-foreground mt-2">
              ({onboardingOkr.numerator_count}/{onboardingOkr.denominator_count}) users met the criteria
            </p>
          ) : null}
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
            <Label htmlFor="ics-upload" className="sr-only">Import .ics file</Label>
            <input
              id="ics-upload"
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
