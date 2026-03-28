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
import { Frown, Meh, Minus, Smile, Laugh } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  latency_minutes: number;
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
  const [wakeCount, setWakeCount] = useState(0);
  const [mood, setMood] = useState<DailySleepMood>('okay');
  const [factors, setFactors] = useState<string[]>([]);
  const [latency, setLatency] = useState(30);
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
      const lat = Number(todayLog.latency_minutes);
      setLatency(LATENCY_OPTIONS.some((o) => o.value === lat) ? lat : 30);
    } else if (justOpened) {
      setActualSleep(goalHours);
      setWakeCount(0);
      setMood('okay');
      setFactors([]);
      setLatency(30);
    }
  }, [isOpen, todayLog, goalHours]);

  const save = useCallback(async () => {
    if (!token) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiJson<{ log: DailySleepLogRow }>('/api/me/daily-sleep-log', {
        method: 'PUT',
        token,
        body: JSON.stringify({
          date: todayStr,
          sleep_goal_hours: Number(displayedGoal),
          actual_sleep_hours: Number(actualSleep),
          wake_up_count: Math.floor(Number(wakeCount)),
          mood,
          factors: Array.isArray(factors) ? factors : [],
          latency_minutes: Math.floor(Number(latency ?? 30)),
        }),
      });
      setTodayLog(res.log);
      setIsOpen(false);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Could not save';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }, [token, todayStr, displayedGoal, actualSleep, wakeCount, mood, factors, latency]);

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
            <DialogTitle>How was your sleep?</DialogTitle>
            <DialogDescription>
              Log how you felt this morning. You can update this anytime today from the log icon.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-1">
            <section className="space-y-3">
              {previousNightBedWake ? (
                <p className="text-sm text-foreground">
                  Last night&apos;s plan:{' '}
                  <span className="font-semibold">{previousNightBedWake}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    (about <span className="font-medium text-foreground">{displayedGoal.toFixed(1)}</span> hours)
                  </span>
                  .
                </p>
              ) : (
                <p className="text-sm text-foreground">
                  Your sleep goal was about{' '}
                  <span className="font-semibold">{displayedGoal.toFixed(1)}</span> hours.
                </p>
              )}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Actual sleep</span>
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
            </section>

            <section className="space-y-2">
              <p className="text-sm font-medium text-foreground">How many times did you wake up?</p>
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
            </section>

            <section className="space-y-2">
              <p className="text-sm font-medium text-foreground">Mood</p>
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

            <section className="space-y-2">
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
            </section>

            <section className="space-y-2">
              <p className="text-sm font-medium text-foreground">Time to fall asleep</p>
              <Select value={String(latency)} onValueChange={(v) => setLatency(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {LATENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
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
