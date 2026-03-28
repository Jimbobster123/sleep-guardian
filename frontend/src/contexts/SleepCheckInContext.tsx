import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DateTime } from 'luxon';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError, apiJson } from '@/lib/api';
import { effectiveTimeZone } from '@/lib/calendarTime';
import {
  estimateSleepGoalHoursForLastNight,
  formatPreviousNightBedWakeRange,
  getPreviousNightPlanBedWakeDateTimes,
  hoursBetweenBedAndWake,
} from '@/lib/sleepGoalHours';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Frown, Meh, Minus, Smile, Laugh, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/sonner';

export type DailySleepMood = 'exhausted' | 'tired' | 'okay' | 'good' | 'energized';

export type DailySleepLogRow = {
  daily_sleep_log_id: string;
  user_id: string;
  log_date: string;
  sleep_goal_hours: number;
  actual_sleep_hours: number;
  wake_up_count: number;
  mood: string;
  factors: string[];
  latency_minutes: number | null;
};

type SleepGoalSummary = {
  goal: {
    goal_type?: string;
    target_sleep_minutes?: number | null;
    target_bedtime?: string | null;
    target_wake_time?: string | null;
    bedtime_flex_minutes?: number | null;
  } | null;
  windows: Array<{ day_of_week: number; start_time: string; end_time: string }>;
};

const FACTOR_OPTIONS = ['Caffeine', 'Alcohol', 'Heavy Meal', 'Screen Time', 'Exercise', 'Stress'] as const;

/** One slider step = 15 minutes; ±12 steps = ±3 hours from plan. */
const OFFSET_STEP_MIN = 15;
const OFFSET_MAX_STEPS = 12;

const MOOD_OPTIONS: { id: DailySleepMood; label: string; Icon: typeof Frown }[] = [
  { id: 'exhausted', label: 'Exhausted', Icon: Frown },
  { id: 'tired', label: 'Tired', Icon: Meh },
  { id: 'okay', label: 'Okay', Icon: Minus },
  { id: 'good', label: 'Good', Icon: Smile },
  { id: 'energized', label: 'Energized', Icon: Laugh },
];

const LATENCY_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: 'Under 15 min' },
  { value: 30, label: 'About 30 min' },
  { value: 45, label: 'About 45 min' },
  { value: 60, label: '1 hour or more' },
];

type SleepCheckInContextValue = {
  todayLog: DailySleepLogRow | null;
  loadingLog: boolean;
  goalHours: number;
  openModal: () => void;
  dismissForSession: () => void;
  refreshLog: () => Promise<void>;
};

const SleepCheckInContext = createContext<SleepCheckInContextValue | null>(null);

export function useSleepCheckIn() {
  const ctx = useContext(SleepCheckInContext);
  if (!ctx) throw new Error('useSleepCheckIn must be used within SleepCheckInProvider');
  return ctx;
}

export function SleepCheckInProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const zone = useMemo(() => effectiveTimeZone(user?.timezone), [user?.timezone]);
  const todayStr = useMemo(() => DateTime.now().setZone(zone).toFormat('yyyy-MM-dd'), [zone]);

  const [isOpen, setIsOpen] = useState(false);
  const [todayLog, setTodayLog] = useState<DailySleepLogRow | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const [sleepSummary, setSleepSummary] = useState<SleepGoalSummary | null>(null);

  const [actualSleep, setActualSleep] = useState(8);
  /** Minutes relative to plan bed/wake, in steps of OFFSET_STEP_MIN. */
  const [bedOffsetSteps, setBedOffsetSteps] = useState(0);
  const [wakeOffsetSteps, setWakeOffsetSteps] = useState(0);
  const [wakeCount, setWakeCount] = useState(0);
  const [mood, setMood] = useState<DailySleepMood>('okay');
  const [factors, setFactors] = useState<string[]>([]);
  const [latency, setLatency] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const wasModalOpen = useRef(false);

  /** Hours target for the night you woke up from (yesterday's schedule). */
  const goalHours = useMemo(
    () => estimateSleepGoalHoursForLastNight(sleepSummary, zone),
    [sleepSummary, zone],
  );
  const previousNightBedWake = useMemo(
    () => formatPreviousNightBedWakeRange(sleepSummary, zone),
    [sleepSummary, zone],
  );

  const planBedWake = useMemo(
    () => getPreviousNightPlanBedWakeDateTimes(sleepSummary, zone),
    [sleepSummary, zone],
  );

  const actualBedWakeFromOffsets = useMemo(() => {
    if (!planBedWake) return null;
    const bed = planBedWake.bed.plus({ minutes: bedOffsetSteps * OFFSET_STEP_MIN });
    const wake = planBedWake.wake.plus({ minutes: wakeOffsetSteps * OFFSET_STEP_MIN });
    const hours = hoursBetweenBedAndWake(bed, wake);
    return { bed, wake, hours };
  }, [planBedWake, bedOffsetSteps, wakeOffsetSteps]);

  const formatShortTime = useCallback((dt: DateTime) => dt.setZone(zone).toFormat('h:mm a'), [zone]);

  const refreshLog = useCallback(async () => {
    if (!token) {
      setTodayLog(null);
      return;
    }
    setLoadingLog(true);
    try {
      const res = await apiJson<{ log: DailySleepLogRow | null }>(
        `/api/me/daily-sleep-log?date=${encodeURIComponent(todayStr)}`,
        { token },
      );
      setTodayLog(res.log ?? null);
    } catch {
      setTodayLog(null);
    } finally {
      setLoadingLog(false);
    }
  }, [token, todayStr]);

  const refreshSleepGoal = useCallback(async () => {
    if (!token) {
      setSleepSummary(null);
      return;
    }
    try {
      const data = await apiJson<SleepGoalSummary>('/api/me/sleep-goal', { token });
      setSleepSummary(data);
    } catch {
      setSleepSummary(null);
    }
  }, [token]);

  useEffect(() => {
    void refreshLog();
  }, [refreshLog]);

  useEffect(() => {
    void refreshSleepGoal();
  }, [refreshSleepGoal]);

  const dismissKey = `luna_sleep_checkin_dismiss_${todayStr}`;

  const dismissForSession = useCallback(() => {
    try {
      sessionStorage.setItem(dismissKey, '1');
    } catch {
      /* ignore */
    }
    setIsOpen(false);
  }, [dismissKey]);

  const openModal = useCallback(() => setIsOpen(true), []);

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setIsOpen(true);
        return;
      }
      if (todayLog) setIsOpen(false);
      else dismissForSession();
    },
    [todayLog, dismissForSession],
  );

  const displayedGoal = todayLog != null ? Number(todayLog.sleep_goal_hours) : goalHours;

  useEffect(() => {
    if (!isOpen) {
      wasModalOpen.current = false;
      return;
    }
    const justOpened = !wasModalOpen.current;
    wasModalOpen.current = true;
    setSaveError(null);
    if (todayLog) {
      setActualSleep(Number(todayLog.actual_sleep_hours));
      setWakeCount(Math.max(0, Math.floor(Number(todayLog.wake_up_count))));
      const m = String(todayLog.mood || '').toLowerCase() as DailySleepMood;
      setMood(MOOD_OPTIONS.some((o) => o.id === m) ? m : 'okay');
      setFactors(Array.isArray(todayLog.factors) ? [...todayLog.factors] : []);
      const lat = todayLog.latency_minutes;
      if (lat == null) {
        setLatency(null);
      } else {
        const n = Number(lat);
        setLatency(LATENCY_OPTIONS.some((o) => o.value === n) ? n : null);
      }

      const plan = getPreviousNightPlanBedWakeDateTimes(sleepSummary, zone);
      if (plan) {
        const planH = hoursBetweenBedAndWake(plan.bed, plan.wake);
        const actualH = Number(todayLog.actual_sleep_hours);
        const diffMin = Math.round((actualH - planH) * 60);
        let wakeS = Math.round(diffMin / OFFSET_STEP_MIN);
        wakeS = Math.max(-OFFSET_MAX_STEPS, Math.min(OFFSET_MAX_STEPS, wakeS));
        const remainder = diffMin - wakeS * OFFSET_STEP_MIN;
        let bedS = Math.round(remainder / OFFSET_STEP_MIN);
        bedS = Math.max(-OFFSET_MAX_STEPS, Math.min(OFFSET_MAX_STEPS, bedS));
        setWakeOffsetSteps(wakeS);
        setBedOffsetSteps(bedS);
      } else {
        setBedOffsetSteps(0);
        setWakeOffsetSteps(0);
      }
    } else if (justOpened) {
      setActualSleep(goalHours);
      setBedOffsetSteps(0);
      setWakeOffsetSteps(0);
      setWakeCount(0);
      setMood('okay');
      setFactors([]);
      setLatency(null);
    }
  }, [isOpen, todayLog, goalHours, sleepSummary, zone]);

  const save = useCallback(async () => {
    if (!token) return;
    setSaving(true);
    setSaveError(null);
    try {
      const actualHoursToSave =
        planBedWake && actualBedWakeFromOffsets != null
          ? Number(actualBedWakeFromOffsets.hours)
          : Number(actualSleep);

      if (!Number.isFinite(actualHoursToSave) || actualHoursToSave < 0 || actualHoursToSave > 24) {
        const hint =
          'Sleep duration looks invalid. Try resetting bed and wake sliders, or tap “Same as my plan”.';
        setSaveError(hint);
        toast.error(hint);
        return;
      }

      const res = await apiJson<{ log: DailySleepLogRow }>('/api/me/daily-sleep-log', {
        method: 'PUT',
        token,
        body: JSON.stringify({
          date: todayStr,
          sleep_goal_hours: Number(displayedGoal),
          actual_sleep_hours: actualHoursToSave,
          wake_up_count: Math.floor(Number(wakeCount)),
          mood,
          factors: Array.isArray(factors) ? factors : [],
          latency_minutes: latency,
        }),
      });
      if (!res?.log) {
        const hint = 'Save did not return your log. Check the network tab or try again.';
        setSaveError(hint);
        toast.error(hint);
        return;
      }
      setTodayLog(res.log);
      setIsOpen(false);
      toast.success('Sleep log saved');
      window.dispatchEvent(new CustomEvent('luna-sleep-checkin-saved'));
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Could not save';
      setSaveError(msg);
      toast.error(msg, { duration: 6000 });
    } finally {
      setSaving(false);
    }
  }, [
    token,
    todayStr,
    displayedGoal,
    actualSleep,
    planBedWake,
    actualBedWakeFromOffsets,
    wakeCount,
    mood,
    factors,
    latency,
  ]);

  const toggleFactor = (f: string) => {
    setFactors((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const value = useMemo(
    () => ({
      todayLog,
      loadingLog,
      goalHours,
      openModal,
      dismissForSession,
      refreshLog,
    }),
    [todayLog, loadingLog, goalHours, openModal, dismissForSession, refreshLog],
  );

  return (
    <SleepCheckInContext.Provider value={value}>
      {children}
      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log last night</DialogTitle>
            <DialogDescription>
              Quick check-in: confirm your plan or nudge bed and wake times. You can reopen anytime from the log icon.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-1">
            <section className="space-y-3">
              {planBedWake && actualBedWakeFromOffsets ? (
                <>
                  <p className="text-sm text-foreground">
                    <span className="text-muted-foreground">Your plan was</span>{' '}
                    <span className="font-semibold">
                      {formatShortTime(planBedWake.bed)} – {formatShortTime(planBedWake.wake)}
                    </span>
                    <span className="text-muted-foreground">
                      {' '}
                      (~<span className="font-medium text-foreground">{displayedGoal.toFixed(1)}</span>h).
                    </span>
                  </p>

                  <Button
                    type="button"
                    variant={bedOffsetSteps === 0 && wakeOffsetSteps === 0 ? 'secondary' : 'outline'}
                    className="w-full gap-2"
                    onClick={() => {
                      setBedOffsetSteps(0);
                      setWakeOffsetSteps(0);
                    }}
                  >
                    {bedOffsetSteps === 0 && wakeOffsetSteps === 0 ? (
                      <Check className="h-4 w-4 shrink-0" aria-hidden />
                    ) : null}
                    Same as my plan
                  </Button>

                  <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3 space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">In bed</span>
                        <span className="font-medium tabular-nums">
                          {formatShortTime(actualBedWakeFromOffsets.bed)}
                          {bedOffsetSteps !== 0 ? (
                            <span className="text-xs font-normal text-muted-foreground ml-1">
                              ({bedOffsetSteps > 0 ? '+' : ''}
                              {bedOffsetSteps * OFFSET_STEP_MIN} min)
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Earlier ← → Later</p>
                      <Slider
                        value={[bedOffsetSteps]}
                        onValueChange={(v) =>
                          setBedOffsetSteps(
                            Math.max(-OFFSET_MAX_STEPS, Math.min(OFFSET_MAX_STEPS, v[0] ?? 0)),
                          )
                        }
                        min={-OFFSET_MAX_STEPS}
                        max={OFFSET_MAX_STEPS}
                        step={1}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">Up for the day</span>
                        <span className="font-medium tabular-nums">
                          {formatShortTime(actualBedWakeFromOffsets.wake)}
                          {wakeOffsetSteps !== 0 ? (
                            <span className="text-xs font-normal text-muted-foreground ml-1">
                              ({wakeOffsetSteps > 0 ? '+' : ''}
                              {wakeOffsetSteps * OFFSET_STEP_MIN} min)
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Earlier ← → Later</p>
                      <Slider
                        value={[wakeOffsetSteps]}
                        onValueChange={(v) =>
                          setWakeOffsetSteps(
                            Math.max(-OFFSET_MAX_STEPS, Math.min(OFFSET_MAX_STEPS, v[0] ?? 0)),
                          )
                        }
                        min={-OFFSET_MAX_STEPS}
                        max={OFFSET_MAX_STEPS}
                        step={1}
                      />
                    </div>

                    <p className="text-center text-sm text-foreground pt-1 border-t border-border/40">
                      About{' '}
                      <span className="font-display font-semibold tabular-nums">
                        {actualBedWakeFromOffsets.hours.toFixed(1)}
                      </span>
                      h in bed
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {previousNightBedWake ? (
                    <p className="text-sm text-foreground">
                      Plan: <span className="font-semibold">{previousNightBedWake}</span> (~
                      {displayedGoal.toFixed(1)}h).
                    </p>
                  ) : (
                    <p className="text-sm text-foreground">
                      Goal about <span className="font-semibold">{displayedGoal.toFixed(1)}</span> hours.
                    </p>
                  )}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">How long did you sleep?</span>
                      <span className="font-medium tabular-nums">{actualSleep.toFixed(1)} h</span>
                    </div>
                    <Slider
                      value={[actualSleep]}
                      onValueChange={(v) => setActualSleep(v[0] ?? 0)}
                      min={0}
                      max={12}
                      step={0.25}
                    />
                  </div>
                </>
              )}
            </section>

            <section className="space-y-2">
              <p className="text-sm font-medium text-foreground">How do you feel?</p>
              <div className="flex justify-between gap-1">
                {MOOD_OPTIONS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMood(id)}
                    title={label}
                    aria-label={label}
                    aria-pressed={mood === id}
                    className={cn(
                      'flex flex-1 flex-col items-center gap-1 rounded-xl border py-2 px-1 transition-colors',
                      mood === id
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50',
                    )}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="text-[10px] font-medium leading-tight text-center">{label}</span>
                  </button>
                ))}
              </div>
            </section>

            <details className="rounded-lg border border-border/50 bg-card/50 px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium text-foreground py-1 list-none flex items-center justify-between">
                <span>More details (optional)</span>
                <span className="text-xs text-muted-foreground">Wake-ups, factors…</span>
              </summary>
              <div className="space-y-4 pt-3 pb-1">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Times you woke up</p>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => setWakeCount((c) => Math.max(0, c - 1))}
                      aria-label="Decrease wake count"
                    >
                      −
                    </Button>
                    <span className="min-w-[2rem] text-center text-lg font-semibold tabular-nums">{wakeCount}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => setWakeCount((c) => Math.min(99, c + 1))}
                      aria-label="Increase wake count"
                    >
                      +
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Factors</p>
                  <div className="flex flex-wrap gap-2">
                    {FACTOR_OPTIONS.map((f) => {
                      const on = factors.includes(f);
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => toggleFactor(f)}
                          aria-pressed={on}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                            on
                              ? 'border-accent bg-accent/15 text-accent'
                              : 'border-border/60 bg-background text-muted-foreground hover:bg-muted/40',
                          )}
                        >
                          {f}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Time to fall asleep</p>
                  <Select
                    value={latency === null ? 'unspecified' : String(latency)}
                    onValueChange={(v) =>
                      setLatency(v === 'unspecified' ? null : Number(v))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unspecified">Not specified</SelectItem>
                      {LATENCY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={String(o.value)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </details>
          </div>

          {saveError ? <p className="text-sm text-red-500 pt-2">{saveError}</p> : null}

          <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="sm:mr-auto"
              onClick={() => handleDialogOpenChange(false)}
              disabled={saving}
            >
              {todayLog ? 'Cancel' : 'Remind me later'}
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : todayLog ? 'Save changes' : 'Save log'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SleepCheckInContext.Provider>
  );
}
