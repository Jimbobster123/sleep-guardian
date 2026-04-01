import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SleepGoalForm, { SleepGoalDraft } from "@/components/SleepGoalForm";
import { ApiError, apiAssetUrl, apiJson } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { useAuth, type StreakType } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { useSleepCheckIn } from "@/contexts/SleepCheckInContext";
import { useTheme } from "@/contexts/ThemeContext";
import { ClipboardList, LogOut, Moon, Shield, Sun, Zap } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { streakGoalMetDisplay, streakRecordingDisplay } from "@/lib/streakDisplay";

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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to read the selected image."));
    reader.readAsDataURL(file);
  });
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
  const [profileBusy, setProfileBusy] = useState(false);
  const [goalBusy, setGoalBusy] = useState(false);
  const [icsBusy, setIcsBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [goalError, setGoalError] = useState<string | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);
  const [pendingPhotoDataUrl, setPendingPhotoDataUrl] = useState<string | null>(null);
  const [reminderMethod, setReminderMethod] = useState<ReminderMethod>("email");
  const [reminderMinutes, setReminderMinutes] = useState("30");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderInitial, setReminderInitial] = useState<ReminderDraft | null>(null);
  const [onboardingOkr, setOnboardingOkr] = useState<OnboardingOKR | null>(null);
  const [loadingOkr, setLoadingOkr] = useState(true);
  const [okrError, setOkrError] = useState<string | null>(null);
  const [streakSaving, setStreakSaving] = useState(false);
  const streakSectionRef = useRef<HTMLDivElement>(null);

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
        const res = await apiJson<{ photo_url: string | null }>("/api/me/profile-photo", { token });
        if (!cancelled) {
          setCurrentPhotoUrl(apiAssetUrl(res.photo_url));
        }
      } catch {
        if (!cancelled) setCurrentPhotoUrl(null);
      }
    })();
    return () => {
      cancelled = true;
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

  useEffect(() => {
    if (searchParams.get("focus") === "streak") {
      streakSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [searchParams]);

  const streakValue: StreakType = user?.streak_type === "GOAL_MET" ? "GOAL_MET" : "RECORDING";

  const saveStreakType = async (next: StreakType) => {
    if (!token || next === streakValue) return;
    setStreakSaving(true);
    try {
      await apiJson<{ user: { streak_type?: string; streak_days?: number } }>("/api/me/profile", {
        method: "PATCH",
        token,
        body: JSON.stringify({ streak_type: next }),
      });
      await refreshMe();
      toast.success("Streak setting saved.", { duration: 2500 });
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not update streak setting."), { duration: 4000 });
    } finally {
      setStreakSaving(false);
    }
  };

  const saveAll = async () => {
    if (!token) return;
    setProfileBusy(true);
    setMsg(null);
    try {
      await apiJson("/api/me/profile", {
        method: "PUT",
        token,
        body: JSON.stringify({ email, first_name: first, last_name: last, phone_number: phoneNumber, timezone: tz }),
      });
      if (pendingPhotoDataUrl) {
        const photoRes = await apiJson<{ photo_url: string }>("/api/me/profile-photo", {
          method: "PUT",
          token,
          body: JSON.stringify({ imageDataUrl: pendingPhotoDataUrl }),
        });
        setCurrentPhotoUrl(apiAssetUrl(photoRes.photo_url));
        setPendingPhotoDataUrl(null);
      }
      await refreshMe();
      toast.success("Profile saved.", { duration: 3000 });
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save."), { duration: 3000 });
    } finally {
      setProfileBusy(false);
    }
  };

  const saveGoal = async (draft: SleepGoalDraft) => {
    if (!token) return;
    setGoalBusy(true);
    setGoalError(null);
    try {
      const res = await apiJson<SleepGoalResponse>("/api/me/sleep-goal", {
        method: "PUT",
        token,
        body: JSON.stringify(draft),
      });
      setGoal({ goal: res.goal, windows: res.windows });
      toast.success("Sleep goal saved.", { duration: 3000 });
    } catch (err) {
      const message = getErrorMessage(err, "Failed to save.");
      setGoalError(message);
      toast.error(message, { duration: 3000 });
    } finally {
      setGoalBusy(false);
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

  const displayPhotoUrl = pendingPhotoDataUrl || currentPhotoUrl;

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
        {user?.is_admin ? (
          <Link
            to="/admin"
            className="flex items-center gap-2 rounded-xl border border-border/50 bg-card px-4 py-3 text-sm font-medium text-foreground shadow-sm hover:bg-muted/40 transition-colors"
          >
            <Shield className="h-4 w-4 text-accent shrink-0" aria-hidden />
            Admin — users and OKR
          </Link>
        ) : null}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50 flex items-center gap-3 overflow-visible">
          <Avatar className="w-10 h-10 border border-border/50">
            {displayPhotoUrl ? <AvatarImage src={displayPhotoUrl} alt="Profile photo" /> : null}
            <AvatarFallback className="bg-accent/20 text-accent text-sm font-semibold">
              {(user?.first_name?.[0] || user?.email?.[0] || "U").toUpperCase()}
              {(user?.last_name?.[0] || "").toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {[user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Your account"}
            </p>
            <p className="text-xs text-foreground/70">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            aria-label="Log out"
            className="group relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <LogOut className="w-4.5 h-4.5 text-muted-foreground" />
            <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 text-sm font-medium text-foreground/70 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              Logout
            </span>
          </button>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-2">Morning sleep log</h2>
          <p className="text-xs text-foreground/70 mb-3">
            Log how last night went — quality, time in bed, and what affected sleep. This updates your home
            suggestions.
          </p>
          <Button type="button" variant="default" size="sm" className="gap-2" onClick={() => openSleepCheckIn()}>
            <ClipboardList className="w-4 h-4" />
            Open sleep log
          </Button>
        </div>

        <div
          ref={streakSectionRef}
          id="streak-settings"
          className="bg-card rounded-xl p-4 shadow-sm border border-border/50"
        >
          <h2 className="text-sm font-semibold text-foreground mb-1">Streak settings</h2>
          <p className="text-xs text-foreground/70 mb-3">
            Choose what counts toward your day streak on the home screen.
          </p>
          <RadioGroup
            value={streakValue}
            onValueChange={(v) => void saveStreakType(v as StreakType)}
            disabled={streakSaving || !token}
            className="gap-3"
          >
            <div className="flex items-start gap-3 rounded-lg border border-border/50 p-3">
              <RadioGroupItem value="RECORDING" id="streak-recording" className="mt-0.5" />
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="streak-recording" className="text-sm font-medium cursor-pointer">
                  Daily Logger
                </Label>
                <p className="text-xs text-foreground/70 leading-relaxed">
                  Increment my streak every day I record my sleep.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border/50 p-3">
              <RadioGroupItem value="GOAL_MET" id="streak-goal" className="mt-0.5" />
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="streak-goal" className="text-sm font-medium cursor-pointer">
                  Goal Crusher
                </Label>
                <p className="text-xs text-foreground/70 leading-relaxed">
                  Only increment my streak on days I hit my sleep goal.
                </p>
              </div>
            </div>
          </RadioGroup>
          <p className="text-xs text-foreground/70 mt-3 tabular-nums">
            Daily log streak:{' '}
            <span className="font-medium text-foreground">
              {streakRecordingDisplay(user) ?? "—"}
            </span>
            {' · '}
            Goal streak:{' '}
            <span className="font-medium text-foreground">{streakGoalMetDisplay(user) ?? "—"}</span>
          </p>
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
                <p className="text-xs text-foreground/70">
                  {crisisMode ? "Active - strategic recovery focus" : "For exams, deadlines, INTEX weeks"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCrisisMode(!crisisMode)}
              className={`relative w-12 h-7 rounded-full transition-colors ${crisisMode ? "bg-crisis" : "bg-muted"}`}
              role="switch"
              aria-checked={crisisMode}
              aria-label="Crisis / Exam Mode"
            >
              <div
                className={`absolute top-1 w-5 h-5 rounded-full bg-card shadow transition-transform ${
                  crisisMode ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          {crisisMode && (
            <ul className="mt-3 text-xs text-foreground/80 space-y-1 list-disc pl-4">
              <li>Goal shifts to "mitigate damage"</li>
              <li>Power nap and 90-minute cycle suggestions enabled</li>
              <li>Streak penalties relaxed</li>
            </ul>
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
                <p className="text-xs text-foreground/70">
                  {theme === "dark" ? "Night theme active" : "Switch to night theme"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className={`relative w-12 h-7 rounded-full transition-colors ${theme === "dark" ? "bg-accent" : "bg-muted"}`}
              role="switch"
              aria-checked={theme === "dark"}
              aria-label="Dark Mode"
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
          <h2 className="text-sm font-semibold text-foreground mb-3">Profile</h2>
          <div className="flex flex-col items-center gap-2 mb-4">
            <label htmlFor="profile-photo" className="cursor-pointer" title="Click to change photo">
              <Avatar className="h-24 w-24 border border-border/50">
                {displayPhotoUrl ? <AvatarImage src={displayPhotoUrl} alt="Profile photo preview" /> : null}
                <AvatarFallback className="text-xl font-semibold">
                  {(first?.[0] || email?.[0] || "U").toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </label>
            <p className="text-xs font-medium text-foreground">
              Profile Photo <span className="text-foreground/70 font-normal">(optional)</span>
            </p>
            <input
              id="profile-photo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) {
                  setPendingPhotoDataUrl(null);
                  return;
                }
                try {
                  setPendingPhotoDataUrl(await readFileAsDataUrl(file));
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to load image.");
                } finally {
                  e.currentTarget.value = "";
                }
              }}
            />
            <label
              htmlFor="profile-photo"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-input bg-background px-4 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-muted/60"
            >
              {pendingPhotoDataUrl ? "Photo selected — click to change" : "Upload photo"}
            </label>
            <p className="text-[11px] text-foreground/70">
              Save the Profile section below to apply your new photo.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="profile-email">Email Address</Label>
              <Input
                id="profile-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-[11px] text-foreground/70">
                Used for login and optional bedtime reminder emails.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="profile-phone">Phone Number</Label>
              <Input
                id="profile-phone"
                type="tel"
                autoComplete="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 555 123 4567"
              />
              <p className="text-[11px] text-foreground/70">
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
            <Button type="button" onClick={saveAll} disabled={profileBusy}>
              {profileBusy ? "Saving..." : "Save Profile"}
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Bedtime Reminder</h2>
              <p className="text-xs text-foreground/70 mt-1">
                Choose how to be reminded before your bedtime goal.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {reminderEnabled ? "Enabled" : "Disabled"}
              </span>
              <Switch
                id="bedtime-reminder-enabled"
                checked={reminderEnabled}
                onCheckedChange={setReminderEnabled}
                aria-label="Enable bedtime reminder"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 mt-4">
            <div className="space-y-1">
              <Label id="reminder-method-label" htmlFor="reminder-method">
                Reminder Method
              </Label>
              <Select
                value={reminderMethod}
                onValueChange={(value: ReminderMethod) => setReminderMethod(value)}
                disabled={!reminderEnabled}
              >
                <SelectTrigger id="reminder-method" aria-labelledby="reminder-method-label">
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
              <Label htmlFor="reminder-minutes">Minutes Before Bedtime</Label>
              <Input
                id="reminder-minutes"
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
            busy={goalBusy}
            submitError={goalError}
          />
          <div className="flex justify-end pt-4">
            <Button
              type="button"
              onClick={() => document.getElementById("profile-sleep-goal-form")?.requestSubmit()}
              disabled={goalBusy}
            >
              {goalBusy ? "Saving..." : "Save Sleep Goal"}
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-2">Calendar Integration</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Sync with Google Calendar or import events from an external calendar file.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              size="sm"
              onClick={() =>
                toast("Coming soon", {
                  description:
                    "Calendar integration is not available in this demo, but will be fully supported in the release version.",
                  duration: 4000,
                })
              }
            >
              Connect Google Calendar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                toast("Coming soon", {
                  description:
                    "Calendar integration is not available in this demo, but will be fully supported in the release version.",
                  duration: 4000,
                })
              }
            >
              Import .ics file
            </Button>
          </div>
        </div>

        {msg && <div className="text-sm text-foreground/80">{msg}</div>}
      </div>
    </div>
  );
}
