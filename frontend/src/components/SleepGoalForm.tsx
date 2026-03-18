import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type GoalType = "fixed_bedtime" | "fixed_wake_time" | "fixed_duration";

export type SleepGoalDraft = {
  goal_type: GoalType;
  target_sleep_minutes?: number | null;
  target_bedtime?: string | null;
  target_wake_time?: string | null;
  bedtime_flex_minutes?: number | null;
  windows: Array<{ day_of_week: number; start_time: string; end_time: string }>;
};

const DAYS: Array<{ dow: number; label: string }> = [
  { dow: 0, label: "Sun" },
  { dow: 1, label: "Mon" },
  { dow: 2, label: "Tue" },
  { dow: 3, label: "Wed" },
  { dow: 4, label: "Thu" },
  { dow: 5, label: "Fri" },
  { dow: 6, label: "Sat" },
];

function normalizeTime(t: string) {
  if (!t) return "00:00:00";
  return t.length === 5 ? `${t}:00` : t;
}

function parseHm(t: string) {
  const [h, m] = String(t).split(":").map((x) => Number(x));
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}

function formatHm(h: number, m: number) {
  const hh = String((h + 24) % 24).padStart(2, "0");
  const mm = String((m + 60) % 60).padStart(2, "0");
  return `${hh}:${mm}:00`;
}

function subtractMinutesFromTime(endTime: string, minutes: number) {
  const { h, m } = parseHm(endTime);
  const total = h * 60 + m - minutes;
  const hh = Math.floor(((total % (24 * 60)) + (24 * 60)) % (24 * 60) / 60);
  const mm = ((total % 60) + 60) % 60;
  return formatHm(hh, mm);
}

export default function SleepGoalForm({
  initial,
  onSubmit,
  submitLabel = "Save",
  busy,
  submitError,
}: {
  initial?: Partial<SleepGoalDraft>;
  onSubmit: (draft: SleepGoalDraft) => Promise<void> | void;
  submitLabel?: string;
  busy?: boolean;
  submitError?: string | null;
}) {
  const initialByDow = useMemo(() => {
    const by: Record<number, { bed: string; wake: string }> = {};
    const defaultBed = String(initial?.target_bedtime || "23:00").slice(0, 5);
    const defaultWake = String(initial?.target_wake_time || "07:00").slice(0, 5);
    for (const d of DAYS) by[d.dow] = { bed: defaultBed, wake: defaultWake };
    for (const w of initial?.windows || []) {
      if (!w) continue;
      if (!(w.day_of_week in by)) continue;
      by[w.day_of_week] = {
        bed: String(w.start_time || "23:00").slice(0, 5),
        wake: String(w.end_time || "07:00").slice(0, 5),
      };
    }
    return by;
  }, [initial?.target_bedtime, initial?.target_wake_time, initial?.windows]);

  const [goalType, setGoalType] = useState<GoalType>((initial?.goal_type as GoalType) || "fixed_bedtime");
  const [targetBedtime, setTargetBedtime] = useState(() => String(initial?.target_bedtime || "").slice(0, 5));
  const [targetWakeTime, setTargetWakeTime] = useState(() => String(initial?.target_wake_time || "").slice(0, 5));
  const [sleepHours, setSleepHours] = useState(() => {
    const mins = initial?.target_sleep_minutes;
    return typeof mins === "number" && mins > 0 ? String(Math.round((mins / 60) * 10) / 10) : "8";
  });
  const [bedFlex, setBedFlex] = useState(() => String(initial?.bedtime_flex_minutes ?? 30));
  const [times, setTimes] = useState<Record<number, { bed: string; wake: string }>>(initialByDow);
  const [flexError, setFlexError] = useState<string | null>(null);
  const [hoursError, setHoursError] = useState<string | null>(null);

  const setTime = (dow: number, key: "bed" | "wake", value: string) => {
    setTimes((t) => ({ ...t, [dow]: { ...t[dow], [key]: value } }));
  };

  const handleFlexChange = (value: string) => {
    if (value === "") {
      setBedFlex(value);
      setFlexError("Flex time must be a whole number.");
      return;
    }
    if (!/^\d+$/.test(value)) {
      setFlexError("Flex time must be a whole number.");
      return;
    }
    setBedFlex(value);
    setFlexError(null);
  };

  const handleSleepHoursChange = (value: string) => {
    if (value === "") {
      setSleepHours(value);
      setHoursError(goalType === "fixed_duration" ? "Sleep hours must be a positive number." : null);
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(value)) {
      setHoursError("Sleep hours must be a number.");
      return;
    }
    if (Number(value) <= 0) {
      setSleepHours(value);
      setHoursError("Sleep hours must be greater than 0.");
      return;
    }
    setSleepHours(value);
    setHoursError(null);
  };

  const hasValidationErrors =
    !!flexError || (goalType === "fixed_duration" && !!hoursError) || bedFlex.trim() === "" || (goalType === "fixed_duration" && sleepHours.trim() === "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasValidationErrors) return;

    const target_sleep_minutes =
      goalType === "fixed_duration" ? Math.max(0, Math.round(Number(sleepHours || 0) * 60)) : null;

    const windows = DAYS.map(({ dow }) => {
      const bed = normalizeTime(times[dow]?.bed || "23:00");
      const wake = normalizeTime(times[dow]?.wake || "07:00");
      const start = goalType === "fixed_duration" && target_sleep_minutes ? subtractMinutesFromTime(wake, target_sleep_minutes) : bed;
      return { day_of_week: dow, start_time: start, end_time: wake };
    });

    await onSubmit({
      goal_type: goalType,
      target_sleep_minutes,
      target_bedtime: goalType === "fixed_bedtime" ? (targetBedtime ? normalizeTime(targetBedtime) : null) : null,
      target_wake_time: goalType === "fixed_wake_time" ? (targetWakeTime ? normalizeTime(targetWakeTime) : null) : null,
      bedtime_flex_minutes: Math.max(0, Math.round(Number(bedFlex || 0))),
      windows,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-2 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="goalType">Goal type</Label>
          <select
            id="goalType"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={goalType}
            onChange={(e) => setGoalType(e.target.value as GoalType)}
          >
            <option value="fixed_bedtime">Set bedtime</option>
            <option value="fixed_wake_time">Set wake time</option>
            <option value="fixed_duration">Set sleep amount</option>
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="flex">Flex (minutes)</Label>
          <Input
            id="flex"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={bedFlex}
            onChange={(e) => handleFlexChange(e.target.value)}
          />
          {flexError && <p className="text-xs text-destructive">{flexError}</p>}
        </div>

        <div className={`space-y-1 ${goalType === "fixed_duration" ? "" : "opacity-50 pointer-events-none"}`}>
          <Label htmlFor="hours">Sleep hours</Label>
          <Input
            id="hours"
            type="number"
            min="0.1"
            step="0.1"
            inputMode="decimal"
            value={sleepHours}
            onChange={(e) => handleSleepHoursChange(e.target.value)}
          />
          {goalType === "fixed_duration" && hoursError && <p className="text-xs text-destructive">{hoursError}</p>}
        </div>
      </div>

      {goalType === "fixed_bedtime" && (
        <div className="space-y-1">
          <Label htmlFor="targetBedtime">General target bedtime</Label>
          <input
            id="targetBedtime"
            type="time"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={targetBedtime}
            onChange={(e) => setTargetBedtime(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Optional. Leave blank to rely only on the per-day bedtime values below.
          </p>
        </div>
      )}

      {goalType === "fixed_wake_time" && (
        <div className="space-y-1">
          <Label htmlFor="targetWakeTime">General target wake time</Label>
          <input
            id="targetWakeTime"
            type="time"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={targetWakeTime}
            onChange={(e) => setTargetWakeTime(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Optional. Leave blank to rely only on the per-day wake times below.
          </p>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border/50 shadow-sm p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {DAYS.map(({ dow, label }) => (
            <div key={dow} className="flex items-center justify-between gap-3">
              <div className="w-12 text-sm font-medium text-foreground">{label}</div>
              <div className="flex items-center gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Bed</Label>
                  <input
                    type="time"
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                    value={times[dow]?.bed || "23:00"}
                    onChange={(e) => setTime(dow, "bed", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Wake</Label>
                  <input
                    type="time"
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                    value={times[dow]?.wake || "07:00"}
                    onChange={(e) => setTime(dow, "wake", e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        {goalType === "fixed_duration" && (
          <p className="mt-3 text-xs text-muted-foreground">
            For "sleep amount", bedtime auto-computes from wake time and the hours you set.
          </p>
        )}
      </div>

      {submitError && <div className="text-sm text-destructive">{submitError}</div>}

      <div className="flex justify-end">
        <Button type="submit" disabled={busy || hasValidationErrors}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

