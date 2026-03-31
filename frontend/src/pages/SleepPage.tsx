import PageHeader from '@/components/PageHeader';
import SleepInsightsCharts from '@/components/SleepInsightsCharts';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiJson } from '@/lib/api';
import { effectiveTimeZone, formatWallTime12h } from '@/lib/calendarTime';
import { estimateSleepGoalHoursForNightStartingOn } from '@/lib/sleepGoalHours';
import { streakDaysForUser } from '@/lib/streakDisplay';
import type { SleepCheckinSummary } from '@/lib/sleepCheckinSummary';
import { formatDebtHours, formatHoursHoursMinutes, formatQualityPct } from '@/lib/sleepCheckinSummary';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import nightSky from '@/assets/night-sky-header.jpg';
import { DateTime } from 'luxon';
import { ChevronLeft, ChevronRight, Moon, Shield } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type SleepGoalSummary = {
  goal: {
    goal_type?: string;
    target_bedtime: string | null;
    target_wake_time: string | null;
    target_sleep_minutes?: number | null;
    bedtime_flex_minutes?: number | null;
  } | null;
  windows: Array<{ day_of_week: number; start_time: string; end_time: string }>;
};

type DailySleepLog = {
  sleep_goal_hours: number;
  actual_sleep_hours: number;
  wake_up_count: number;
  mood: string;
  latency_minutes: number | null;
};

type DailySleepMood = 'exhausted' | 'tired' | 'okay' | 'good' | 'energized';

function apiDayOfWeek(dt: DateTime): number {
  return dt.weekday === 7 ? 0 : dt.weekday;
}

function toHhmm(value: string | null | undefined, fallback: string): string {
  if (!value || typeof value !== 'string') return fallback;
  const m = value.trim().match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!m) return fallback;
  return `${m[1]}:${m[2]}`;
}

function toHhmmss(value: string): string {
  const m = String(value || '').trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return '00:00:00';
  return `${m[1]}:${m[2]}:${m[3] || '00'}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function qualityPctFromLog(log: DailySleepLog | null): number | null {
  if (!log) return null;
  const mood = String(log.mood || '').toLowerCase();
  let q = mood === 'energized' ? 100 : mood === 'good' ? 80 : mood === 'okay' ? 60 : mood === 'tired' ? 40 : mood === 'exhausted' ? 20 : 55;
  const wakes = Math.max(0, Math.floor(Number(log.wake_up_count) || 0));
  q -= Math.min(20, wakes * 5);
  if (log.latency_minutes === 60) q -= 6;
  else if (log.latency_minutes === 45) q -= 3;
  return Math.round(clamp(q, 0, 100));
}

const SleepPage = () => {
  const { token, user } = useAuth();
  const streakDays = streakDaysForUser(user);
  const { crisisMode, bedtime, wakeTime } = useApp();
  const zone = useMemo(() => effectiveTimeZone(user?.timezone), [user?.timezone]);
  const [sleepRes, setSleepRes] = useState<SleepGoalSummary | null>(null);
  const [selectedLog, setSelectedLog] = useState<DailySleepLog | null>(null);
  const [editTonightOpen, setEditTonightOpen] = useState(false);
  const [editBedtime, setEditBedtime] = useState('23:00');
  const [editWakeTime, setEditWakeTime] = useState('07:00');
  const [savingTonightGoal, setSavingTonightGoal] = useState(false);
  const [editTonightError, setEditTonightError] = useState<string | null>(null);
  const [logMissingOpen, setLogMissingOpen] = useState(false);
  const [logGoalHours, setLogGoalHours] = useState('8.0');
  const [logActualHours, setLogActualHours] = useState('8.0');
  const [logWakeCount, setLogWakeCount] = useState('0');
  const [logMood, setLogMood] = useState<DailySleepMood>('okay');
  const [logLatency, setLogLatency] = useState('');
  const [savingMissingLog, setSavingMissingLog] = useState(false);
  const [logMissingError, setLogMissingError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<SleepGoalSummary>('/api/me/sleep-goal', { token });
        if (!cancelled) setSleepRes(data);
      } catch {
        if (!cancelled) setSleepRes(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const todayStr = useMemo(() => DateTime.now().setZone(zone).toFormat('yyyy-MM-dd'), [zone]);
  const [insightDate, setInsightDate] = useState(todayStr);

  useEffect(() => {
    setInsightDate(todayStr);
  }, [todayStr]);

  const fetchSelectedLog = useCallback(async () => {
    if (!token) {
      setSelectedLog(null);
      return;
    }
    try {
      const data = await apiJson<{ log: DailySleepLog | null }>(
        `/api/me/daily-sleep-log?date=${encodeURIComponent(insightDate)}`,
        { token },
      );
      setSelectedLog(data?.log ?? null);
    } catch {
      setSelectedLog(null);
    }
  }, [token, insightDate]);

  useEffect(() => {
    void fetchSelectedLog();
  }, [fetchSelectedLog]);

  useEffect(() => {
    const onSaved = () => void fetchSelectedLog();
    window.addEventListener('luna-sleep-checkin-saved', onSaved);
    return () => window.removeEventListener('luna-sleep-checkin-saved', onSaved);
  }, [fetchSelectedLog]);

  const tonightLine = useMemo(() => {
    const now = DateTime.now().setZone(zone);
    const win = sleepRes?.windows?.find((w) => Number(w.day_of_week) === apiDayOfWeek(now));
    const g = sleepRes?.goal;
    if (win) {
      const a = formatWallTime12h(win.start_time);
      const b = formatWallTime12h(win.end_time);
      if (a && b) return `${a} – ${b}`;
    }
    if (g?.target_bedtime || g?.target_wake_time) {
      const a = formatWallTime12h(g.target_bedtime);
      const b = formatWallTime12h(g.target_wake_time);
      if (a && b) return `${a} – ${b}`;
      if (a) return `Target bedtime ${a}`;
      if (b) return `Target wake ${b}`;
    }
    return `${bedtime} – ${wakeTime}`;
  }, [sleepRes, zone, bedtime, wakeTime]);

  const flexMins = sleepRes?.goal?.bedtime_flex_minutes;
  const tonightDow = useMemo(() => DateTime.now().setZone(zone).weekday % 7, [zone]);
  const tonightWindow = useMemo(
    () => (sleepRes?.windows || []).find((w) => Number(w.day_of_week) === tonightDow) || null,
    [sleepRes?.windows, tonightDow],
  );

  const homeQualityPct = qualityPctFromLog(selectedLog);
  const homeTimeInBedHours = selectedLog ? Number(selectedLog.actual_sleep_hours) : null;
  const homeDebt7d = selectedLog
    ? Math.max(0, Number(selectedLog.sleep_goal_hours) - Number(selectedLog.actual_sleep_hours))
    : null;
  const canMoveForward = insightDate < todayStr;
  const insightTitle = useMemo(() => {
    const d = DateTime.fromFormat(insightDate, 'yyyy-MM-dd', { zone });
    const t = DateTime.fromFormat(todayStr, 'yyyy-MM-dd', { zone });
    if (!d.isValid || !t.isValid) return insightDate;
    const night = d.minus({ days: 1 });
    const diff = Math.floor(t.diff(night, 'days').days);
    if (diff >= 0 && diff <= 6) return `${night.toFormat('EEEE')} Night`;
    return `${night.toFormat('MMM d, yyyy')} Night`;
  }, [insightDate, todayStr, zone]);

  const openTonightEditor = useCallback(() => {
    const bed = toHhmm(tonightWindow?.start_time || sleepRes?.goal?.target_bedtime, '23:00');
    const wake = toHhmm(tonightWindow?.end_time || sleepRes?.goal?.target_wake_time, '07:00');
    setEditBedtime(bed);
    setEditWakeTime(wake);
    setEditTonightError(null);
    setEditTonightOpen(true);
  }, [tonightWindow?.start_time, tonightWindow?.end_time, sleepRes?.goal?.target_bedtime, sleepRes?.goal?.target_wake_time]);

  const openMissingLogEditor = useCallback(() => {
    const wakeDay = DateTime.fromFormat(insightDate, 'yyyy-MM-dd', { zone });
    const nightStart = wakeDay.isValid ? wakeDay.minus({ days: 1 }) : DateTime.now().setZone(zone).minus({ days: 1 });
    const target = estimateSleepGoalHoursForNightStartingOn(sleepRes, nightStart);
    const goal = Number.isFinite(target) ? target : 8;
    setLogGoalHours(goal.toFixed(1));
    setLogActualHours(goal.toFixed(1));
    setLogWakeCount('0');
    setLogMood('okay');
    setLogLatency('');
    setLogMissingError(null);
    setLogMissingOpen(true);
  }, [insightDate, zone, sleepRes]);

  const saveTonightGoal = useCallback(async () => {
    if (!token) return;
    setSavingTonightGoal(true);
    setEditTonightError(null);
    try {
      const g = sleepRes?.goal;
      const goalType = g?.goal_type || 'fixed_bedtime';
      const windows = Array.isArray(sleepRes?.windows) && sleepRes.windows.length > 0
        ? sleepRes.windows.map((w) =>
            Number(w.day_of_week) === tonightDow
              ? {
                  day_of_week: Number(w.day_of_week),
                  start_time: toHhmmss(editBedtime),
                  end_time: toHhmmss(editWakeTime),
                }
              : {
                  day_of_week: Number(w.day_of_week),
                  start_time: toHhmmss(toHhmm(w.start_time, '23:00')),
                  end_time: toHhmmss(toHhmm(w.end_time, '07:00')),
                },
          )
        : [
            {
              day_of_week: tonightDow,
              start_time: toHhmmss(editBedtime),
              end_time: toHhmmss(editWakeTime),
            },
          ];

      const payload = {
        goal_type: goalType,
        target_sleep_minutes:
          goalType === 'fixed_duration'
            ? Math.max(1, Math.round(Number(g?.target_sleep_minutes ?? 480)))
            : null,
        target_bedtime: toHhmmss(toHhmm(g?.target_bedtime, editBedtime)),
        target_wake_time: toHhmmss(toHhmm(g?.target_wake_time, editWakeTime)),
        bedtime_flex_minutes: Math.max(0, Math.round(Number(g?.bedtime_flex_minutes ?? 0))),
        windows,
      };

      const res = await apiJson<SleepGoalSummary>('/api/me/sleep-goal', {
        method: 'PUT',
        token,
        body: JSON.stringify(payload),
      });
      setSleepRes(res);
      setEditTonightOpen(false);
    } catch (err) {
      setEditTonightError(err instanceof Error ? err.message : 'Could not update tonight sleep goal.');
    } finally {
      setSavingTonightGoal(false);
    }
  }, [token, sleepRes, tonightDow, editBedtime, editWakeTime]);

  const saveMissingLog = useCallback(async () => {
    if (!token) return;
    setSavingMissingLog(true);
    setLogMissingError(null);
    try {
      const payload = {
        date: insightDate,
        sleep_goal_hours: Number(logGoalHours),
        actual_sleep_hours: Number(logActualHours),
        wake_up_count: Math.floor(Number(logWakeCount)),
        mood: logMood,
        factors: [] as string[],
        latency_minutes: logLatency ? Number(logLatency) : null,
      };
      const res = await apiJson<{ log: DailySleepLog | null }>('/api/me/daily-sleep-log', {
        method: 'PUT',
        token,
        body: JSON.stringify(payload),
      });
      setSelectedLog(res?.log ?? null);
      setLogMissingOpen(false);
      window.dispatchEvent(new CustomEvent('luna-sleep-checkin-saved'));
    } catch (err) {
      setLogMissingError(err instanceof Error ? err.message : 'Could not save sleep log.');
    } finally {
      setSavingMissingLog(false);
    }
  }, [token, insightDate, logGoalHours, logActualHours, logWakeCount, logMood, logLatency]);

  return (
    <div>
      <PageHeader title="Sleep" compact />

      <div className="space-y-5 px-5 pb-10 pt-1">
        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-3xl border border-border/30 shadow-md cursor-pointer"
          role="button"
          tabIndex={0}
          aria-label="Edit tonight sleep goal"
          onClick={openTonightEditor}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openTonightEditor();
            }
          }}
        >
          <img src={nightSky} alt="" className="h-44 w-full object-cover md:h-52" />
          <div className="night-gradient absolute inset-0 opacity-80" />
          <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-6">
            <div className="flex items-center gap-2 text-primary-foreground/90">
              <Moon className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-wider">Tonight</span>
            </div>
            <h1 className="mt-1 font-display text-2xl font-semibold text-primary-foreground md:text-3xl">
              {tonightLine}
            </h1>
            <p className="mt-2 max-w-lg text-sm text-primary-foreground/85">
              {flexMins != null
                ? `${flexMins} min wind-down before bed · ${streakDays}-day streak`
                : `${streakDays}-day streak · stay gentle with yourself`}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
              onClick={() =>
                setInsightDate((d) =>
                  DateTime.fromFormat(d, 'yyyy-MM-dd', { zone }).minus({ days: 1 }).toFormat('yyyy-MM-dd'),
                )
              }
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{insightTitle}</p>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
              onClick={() =>
                setInsightDate((d) =>
                  DateTime.fromFormat(d, 'yyyy-MM-dd', { zone }).plus({ days: 1 }).toFormat('yyyy-MM-dd'),
                )
              }
              disabled={!canMoveForward}
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {selectedLog ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-muted/50 py-2.5 px-1 text-center min-w-0">
                <p className="mt-1 font-display text-lg font-bold text-foreground tabular-nums">
                  {formatQualityPct(homeQualityPct)}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Quality</p>
              </div>
              <div className="rounded-lg bg-muted/50 py-2.5 px-1 text-center min-w-0">
                <p className="mt-1 font-display text-lg font-bold text-foreground tabular-nums">
                  {formatHoursHoursMinutes(homeTimeInBedHours)}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Time in bed</p>
              </div>
              <div className="rounded-lg bg-muted/50 py-2.5 px-1 text-center min-w-0">
                <p className="mt-1 font-display text-lg font-bold text-foreground tabular-nums">
                  {formatDebtHours(homeDebt7d)}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Debt</p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-muted/40 px-3 py-3">
              <p className="text-sm text-muted-foreground">No sleep data logged.</p>
              <Button type="button" size="sm" className="mt-3" onClick={openMissingLogEditor}>
                Log this night
              </Button>
            </div>
          )}
        </section>

        {token ? <SleepInsightsCharts token={token} zone={zone} /> : null}

        {crisisMode && (
          <section className="rounded-2xl border border-crisis/25 bg-crisis-light p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-crisis">
              <Shield className="h-4 w-4" />
              Crisis recovery
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-foreground">
              <li>Short nap 1–3 PM if you&apos;re crashing (about 20 minutes).</li>
              <li>Prefer 1.5h or 3h sleeps if you can&apos;t get a full night—full cycles help.</li>
              <li>Streak pressure is relaxed; focus on steady wake time when you can.</li>
            </ul>
          </section>
        )}

        <Dialog open={editTonightOpen} onOpenChange={setEditTonightOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit tonight sleep goal</DialogTitle>
              <DialogDescription>
                Update your bedtime and wake-time window for tonight.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Bedtime</label>
                <Input
                  type="time"
                  value={editBedtime}
                  onChange={(e) => setEditBedtime(e.target.value)}
                  disabled={savingTonightGoal}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Wake time</label>
                <Input
                  type="time"
                  value={editWakeTime}
                  onChange={(e) => setEditWakeTime(e.target.value)}
                  disabled={savingTonightGoal}
                />
              </div>
            </div>
            {editTonightError ? <p className="text-xs text-destructive">{editTonightError}</p> : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditTonightOpen(false)} disabled={savingTonightGoal}>
                Cancel
              </Button>
              <Button onClick={() => void saveTonightGoal()} disabled={savingTonightGoal}>
                {savingTonightGoal ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={logMissingOpen} onOpenChange={setLogMissingOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Log this night</DialogTitle>
              <DialogDescription>
                Add sleep data for {insightTitle}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Goal hours</label>
                <Input type="number" step="0.1" min="0" max="24" value={logGoalHours} onChange={(e) => setLogGoalHours(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Actual hours</label>
                <Input type="number" step="0.1" min="0" max="24" value={logActualHours} onChange={(e) => setLogActualHours(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Wake-ups</label>
                <Input type="number" step="1" min="0" max="99" value={logWakeCount} onChange={(e) => setLogWakeCount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Mood</label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={logMood}
                  onChange={(e) => setLogMood(e.target.value as DailySleepMood)}
                >
                  <option value="exhausted">Exhausted</option>
                  <option value="tired">Tired</option>
                  <option value="okay">Okay</option>
                  <option value="good">Good</option>
                  <option value="energized">Energized</option>
                </select>
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-xs font-medium text-foreground">Time to fall asleep</label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={logLatency}
                  onChange={(e) => setLogLatency(e.target.value)}
                >
                  <option value="">Not set</option>
                  <option value="15">Under 15 min</option>
                  <option value="30">About 30 min</option>
                  <option value="45">About 45 min</option>
                  <option value="60">1 hour or more</option>
                </select>
              </div>
            </div>
            {logMissingError ? <p className="text-xs text-destructive">{logMissingError}</p> : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setLogMissingOpen(false)} disabled={savingMissingLog}>
                Cancel
              </Button>
              <Button onClick={() => void saveMissingLog()} disabled={savingMissingLog}>
                {savingMissingLog ? 'Saving…' : 'Save log'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
};

export default SleepPage;
