import HeroStarfield from '@/components/HeroStarfield';
import TaskItem from '@/components/TaskItem';
import { Button } from '@/components/ui/button';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSleepCheckIn } from '@/contexts/SleepCheckInContext';
import { apiJson } from '@/lib/api';
import { isTaskPastDue } from '@/lib/taskOverdue';
import {
  effectiveTimeZone,
  formatWallTime12h,
  parseApiTimestamp,
  parseApiTimestampToDate,
} from '@/lib/calendarTime';
import {
  buildDailyAction,
  buildHomeSleepSuggestions,
  readDailyActionChoice,
  writeDailyActionChoice,
} from '@/lib/homeSleepSuggestions';
import { estimateSleepGoalHoursForToday } from '@/lib/sleepGoalHours';
import { streakDaysForUser } from '@/lib/streakDisplay';
import type { SleepCheckinSummary } from '@/lib/sleepCheckinSummary';
import {
  formatDebtHours,
  formatHoursHoursMinutes,
  formatQualityPct,
} from '@/lib/sleepCheckinSummary';
import nightSky from '@/assets/night-sky-header.jpg';
import { DateTime } from 'luxon';
import { isToday } from 'date-fns';
import { Moon, Flame, ChevronRight, ClipboardList, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/ui/sonner';

interface Task {
  task_id?: string;
  title: string;
  notes?: string | null;
  priority: number;
  status: string;
  estimated_minutes: number;
  planned_datetime?: string | null;
  due_datetime?: string | null;
  category?: string | null;
}

type HomeCalendarEventRow = {
  event_id: string;
  title: string | null;
  start_datetime: string;
  end_datetime: string;
  source: string | null;
  is_all_day?: boolean | null;
  start: Date;
  end: Date;
};

type ApiCalendarEvent = {
  event_id: string;
  title: string | null;
  start_datetime: string;
  end_datetime: string;
  source: string | null;
  is_all_day?: boolean | null;
};

type SleepGoalSummary = {
  goal: {
    goal_type?: string;
    target_bedtime: string | null;
    target_wake_time: string | null;
    bedtime_flex_minutes?: number | null;
  } | null;
  windows: Array<{ day_of_week: number; start_time: string; end_time: string }>;
};

function apiDayOfWeek(dt: DateTime): number {
  return dt.weekday === 7 ? 0 : dt.weekday;
}

function getEventStyle(source?: string | null) {
  if (source === 'task_planned') return 'bg-accent/15 border border-accent/30 text-foreground';
  if (source === 'task_due') return 'bg-accent/25 border border-accent/40 text-foreground';
  if (source === 'ics') return 'bg-cognitive-medium text-foreground';
  return 'bg-cognitive-low text-foreground';
}

function parseTaskDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const raw = String(s).includes('T') ? s : String(s).replace(' ', 'T');
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isLocalToday(s: string | undefined | null): boolean {
  const d = parseTaskDate(s);
  return d != null && isToday(d);
}

/** Prefer planned time for today when both exist (matches Tasks page). */
function effectiveTodaySortMs(t: Task): number {
  const p =
    t.planned_datetime && isLocalToday(t.planned_datetime)
      ? parseTaskDate(t.planned_datetime)!.getTime()
      : null;
  const d =
    t.due_datetime && isLocalToday(t.due_datetime)
      ? parseTaskDate(t.due_datetime)!.getTime()
      : null;
  if (p != null && d != null) return p;
  if (p != null) return p;
  if (d != null) return d;
  return Number.MAX_SAFE_INTEGER;
}

const Home = () => {
  const { token, user } = useAuth();
  const streakDays = streakDaysForUser(user);
  const streakSubtext =
    user?.streak_type === 'GOAL_MET' ? 'Goal Completion Streak' : 'Daily Log Streak';
  const { openModal: openSleepCheckIn } = useSleepCheckIn();
  const { bedtime, wakeTime } = useApp();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const [sleepRes, setSleepRes] = useState<SleepGoalSummary | null>(null);
  const [sleepCheckinSummary, setSleepCheckinSummary] = useState<SleepCheckinSummary | null>(null);

  const zone = useMemo(() => effectiveTimeZone(user?.timezone), [user?.timezone]);
  const { todayStr, tomorrowStr, todayLabel } = useMemo(() => {
    const now = DateTime.now().setZone(zone);
    return {
      todayStr: now.toFormat('yyyy-MM-dd'),
      tomorrowStr: now.plus({ days: 1 }).toFormat('yyyy-MM-dd'),
      todayLabel: now.toFormat('EEEE, MMM d'),
    };
  }, [zone]);

  const fetchSleepCheckinSummary = useCallback(async () => {
    if (!token) {
      setSleepCheckinSummary(null);
      return;
    }
    try {
      const data = await apiJson<SleepCheckinSummary>('/api/me/sleep-checkin-summary', { token });
      setSleepCheckinSummary(data);
    } catch {
      setSleepCheckinSummary(null);
    }
  }, [token]);

  useEffect(() => {
    void fetchSleepCheckinSummary();
  }, [fetchSleepCheckinSummary]);

  useEffect(() => {
    const onSaved = () => void fetchSleepCheckinSummary();
    window.addEventListener('luna-sleep-checkin-saved', onSaved);
    return () => window.removeEventListener('luna-sleep-checkin-saved', onSaved);
  }, [fetchSleepCheckinSummary]);

  const homeQualityPct =
    sleepCheckinSummary?.last_night?.quality_pct ??
    sleepCheckinSummary?.rolling_7d.avg_quality_pct ??
    null;
  const homeTimeInBedHours =
    sleepCheckinSummary?.last_night?.time_in_bed_hours ??
    sleepCheckinSummary?.rolling_7d.avg_time_in_bed_hours ??
    null;
  const homeDebt7d = sleepCheckinSummary?.rolling_7d.sleep_debt_hours ?? null;
  const homeStatsSource = sleepCheckinSummary?.last_night
    ? 'Last log'
    : sleepCheckinSummary?.rolling_7d.nights_logged
      ? '7d average'
      : null;

  const sleepTonightLine = useMemo(() => {
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
      if (a) return `Bed ${a}`;
      if (b) return `Wake ${b}`;
    }
    return bedtime;
  }, [sleepRes, zone, bedtime]);

  const tonightGoalHours = useMemo(
    () => estimateSleepGoalHoursForToday(sleepRes, zone),
    [sleepRes, zone],
  );

  const windDownLine = useMemo(() => {
    const m = sleepRes?.goal?.bedtime_flex_minutes;
    if (m != null && m > 0) return `${m} min wind-down before bed`;
    return null;
  }, [sleepRes]);

  const [calEvents, setCalEvents] = useState<ApiCalendarEvent[]>([]);
  const [calLoading, setCalLoading] = useState(true);
  const [calError, setCalError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNowTick(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!token) return;

    const fetchTasks = async () => {
      try {
        const data = await apiJson<Task[]>('/api/me/tasks', { token });
        setTasks(data);
        setTaskError(null);
      } catch (err) {
        console.error('Error fetching home tasks:', err);
        setTaskError(err instanceof Error ? err.message : 'Failed to load tasks');
      } finally {
        setLoadingTasks(false);
      }
    };

    fetchTasks();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        setCalLoading(true);
        const from = encodeURIComponent(`${todayStr} 00:00:00`);
        const to = encodeURIComponent(`${tomorrowStr} 00:00:00`);
        const data = await apiJson<ApiCalendarEvent[]>(
          `/api/me/calendar-events?from=${from}&to=${to}`,
          { token },
        );
        if (!cancelled) {
          setCalEvents(Array.isArray(data) ? data : []);
          setCalError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error fetching home calendar:', err);
          setCalError(err instanceof Error ? err.message : 'Failed to load calendar');
        }
      } finally {
        if (!cancelled) setCalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, todayStr, tomorrowStr]);

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

  const { allDayRows, timedRows, dayEndMs } = useMemo(() => {
    const day0 = parseApiTimestamp(`${todayStr} 00:00:00`, zone);
    if (!day0) {
      return {
        allDayRows: [] as HomeCalendarEventRow[],
        timedRows: [] as HomeCalendarEventRow[],
        dayEndMs: null as number | null,
      };
    }
    const day1 = day0.plus({ days: 1 });
    const startMs = day0.toMillis();
    const endMs = day1.toMillis();

    const rows: HomeCalendarEventRow[] = [];
    for (const e of calEvents) {
      const s = parseApiTimestampToDate(e.start_datetime, zone);
      const en = parseApiTimestampToDate(e.end_datetime, zone);
      if (!s || !en) continue;
      if (en.getTime() <= startMs || s.getTime() >= endMs) continue;
      rows.push({ ...e, start: s, end: en });
    }

    const allDay = rows.filter((r) => r.is_all_day);
    const timed = rows.filter((r) => !r.is_all_day);
    timed.sort((a, b) => a.start.getTime() - b.start.getTime());
    allDay.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    return { allDayRows: allDay, timedRows: timed, dayEndMs: endMs };
  }, [calEvents, todayStr, zone]);

  const upcomingTimedRows = useMemo(
    () => timedRows.filter((ev) => ev.end.getTime() > nowTick.getTime()),
    [timedRows, nowTick],
  );

  const homeMiniTimeline = useMemo(() => {
    const SIX_H_MS = 6 * 60 * 60 * 1000;
    const viewStartMs = nowTick.getTime();
    const capMs = dayEndMs ?? viewStartMs + SIX_H_MS;

    let lastEnd = viewStartMs;
    for (const ev of upcomingTimedRows) {
      lastEnd = Math.max(lastEnd, ev.end.getTime());
    }

    let viewEndMs = Math.max(viewStartMs + SIX_H_MS, lastEnd);
    viewEndMs = Math.min(viewEndMs, capMs);
    if (viewEndMs <= viewStartMs) {
      viewEndMs = Math.min(capMs, viewStartMs + SIX_H_MS);
    }

    const denom = Math.max(60_000, viewEndMs - viewStartMs);
    const pct = (ms: number) => ((ms - viewStartMs) / denom) * 100;

    const hourTicks: { ms: number; label: string }[] = [];
    let tick = DateTime.fromMillis(viewStartMs).setZone(zone).startOf('hour');
    if (tick.toMillis() < viewStartMs) {
      tick = tick.plus({ hours: 1 });
    }
    while (tick.toMillis() < viewEndMs) {
      if (tick.toMillis() - viewStartMs > 45_000) {
        hourTicks.push({
          ms: tick.toMillis(),
          label: tick.toFormat('h:mm a'),
        });
      }
      tick = tick.plus({ hours: 1 });
    }

    const hoursSpan = denom / 3_600_000;
    const pxPerHour = 56;
    const heightPx = Math.min(720, Math.max(300, Math.ceil(hoursSpan * pxPerHour)));

    return {
      viewStartMs,
      viewEndMs,
      denom,
      pct,
      hourTicks,
      heightPx,
    };
  }, [upcomingTimedRows, nowTick, dayEndMs, zone]);

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return undefined;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDateTime = (dateString: string | null | undefined) => {
    if (!dateString) return undefined;
    const d = parseTaskDate(dateString);
    if (!d) return undefined;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const priorityOpenCount = useMemo(
    () => tasks.filter((t) => t.status !== 'completed' && t.priority === 1).length,
    [tasks],
  );

  const mergedTodayTasks = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'completed');
    const ids = new Set<string>();
    const list: Task[] = [];
    for (const t of open) {
      if (isLocalToday(t.due_datetime) || isLocalToday(t.planned_datetime)) {
        if (t.task_id) ids.add(t.task_id);
        list.push(t);
      }
    }
    for (const t of open) {
      if (t.priority !== 1) continue;
      if (t.task_id && ids.has(t.task_id)) continue;
      if (t.task_id) ids.add(t.task_id);
      list.push(t);
    }
    return [...list].sort((a, b) => {
      const pa = a.priority ?? 99;
      const pb = b.priority ?? 99;
      if (pa !== pb) return pa - pb;
      return effectiveTodaySortMs(a) - effectiveTodaySortMs(b);
    });
  }, [tasks]);

  const homeSuggestions = useMemo(
    () =>
      buildHomeSleepSuggestions(sleepCheckinSummary, zone, {
        goalHoursTonight: tonightGoalHours,
        priorityOpenCount,
      }),
    [sleepCheckinSummary, zone, tonightGoalHours, priorityOpenCount],
  );

  const dailyAction = useMemo(
    () =>
      buildDailyAction(sleepCheckinSummary, zone, {
        goalHoursTonight: tonightGoalHours,
        priorityOpenCount,
      }),
    [sleepCheckinSummary, zone, tonightGoalHours, priorityOpenCount],
  );

  const [dailyActionChoice, setDailyActionChoice] = useState(() => readDailyActionChoice(todayStr));

  useEffect(() => {
    setDailyActionChoice(readDailyActionChoice(todayStr));
  }, [todayStr]);

  const handleTaskCompletion = async (taskId: string | undefined, checked: boolean) => {
    if (!token || !taskId) return;

    const nextStatus = checked ? 'completed' : 'pending';
    const previousTasks = tasks;

    setUpdatingTaskId(taskId);
    setTasks((prev) =>
      prev.map((task) =>
        task.task_id === taskId ? { ...task, status: nextStatus } : task,
      ),
    );

    try {
      const updated = await apiJson<Task>(`/api/me/tasks/${taskId}/status`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status: nextStatus }),
      });

      setTasks((prev) =>
        prev.map((task) => (task.task_id === taskId ? updated : task)),
      );

      if (checked) {
        toast.success('Task marked completed');
      }
    } catch (err) {
      setTasks(previousTasks);
      console.error('Error updating task status:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update task status');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  return (
    <div>
      <div className="px-5 -mt-2 space-y-4 pb-6">
        {/* Hero — tonight window + goal (decorative layers are aria-hidden for AT) */}
        <section
          className="relative overflow-hidden rounded-3xl border border-border/40 shadow-lg shadow-sleep/10 animate-fade-in"
          aria-labelledby="home-hero-heading"
        >
          <img src={nightSky} alt="" className="h-40 w-full object-cover md:h-48" decoding="async" />
          <div className="night-gradient absolute inset-0 opacity-85" aria-hidden />
          <HeroStarfield />
          <div className="luna-hero-aurora absolute inset-0 mix-blend-soft-light" aria-hidden />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black/55 via-black/20 to-transparent dark:from-black/60 dark:via-black/25"
            aria-hidden
          />
          <div
            className="absolute bottom-5 right-5 z-[4] flex max-w-[min(100%,12.5rem)] flex-col gap-0.5 rounded-2xl border border-border/70 bg-card/95 px-3 py-2 shadow-md backdrop-blur-sm dark:border-border/80 dark:bg-card/95"
            role="group"
            aria-label={`${streakDays} day streak, ${streakSubtext}`}
          >
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 shrink-0 text-warning" aria-hidden />
              <span className="font-display text-lg font-bold tabular-nums text-foreground">{streakDays}</span>
              <span className="text-xs font-medium text-muted-foreground">day streak</span>
            </div>
            <div className="flex items-center justify-between gap-1 pl-6">
              <span className="text-[10px] text-muted-foreground leading-tight">{streakSubtext}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/profile?focus=streak');
                }}
                className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                aria-label="Edit streak settings in Profile"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="absolute inset-0 z-[3] flex flex-col justify-end p-5 md:p-6 pr-[min(30%,11rem)]">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-primary-foreground">
                <Moon className="h-5 w-5 shrink-0" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-wider">Tonight</span>
              </div>
              <h1
                id="home-hero-heading"
                className="mt-1 font-display text-2xl font-semibold leading-tight text-primary-foreground drop-shadow-sm md:text-3xl"
              >
                {sleepTonightLine}
              </h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-primary-foreground/95">
                {windDownLine
                  ? `${windDownLine} · ${Math.round(tonightGoalHours * 10) / 10}h target`
                  : `${Math.round(tonightGoalHours * 10) / 10}h sleep goal · wake around ${wakeTime}`}
              </p>
            </div>
          </div>
        </section>

        {/* Sleep — tap card for sleep page; log / suggestion buttons isolated */}
        <div
          role="link"
          tabIndex={0}
          aria-label="Sleep — open full sleep page"
          className="luna-card-interactive w-full cursor-pointer p-4 text-left animate-fade-in"
          onClick={() => navigate('/sleep')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/sleep');
            }
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Sleep</h2>
            <ChevronRight className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          </div>

          <p className="text-xs text-muted-foreground mb-3">
            {sleepCheckinSummary?.last_night
              ? 'Quick read from your latest morning log. Tap this card for charts and insights.'
              : homeStatsSource
                ? 'Quality and time use your rolling average until you log again.'
                : 'Log when you wake up to personalize this card.'}
          </p>

          <div className="grid grid-cols-3 gap-2">
            <div className="text-center py-2.5 px-1 bg-muted/50 rounded-lg min-w-0">
              <p className="text-lg sm:text-xl font-display font-bold text-foreground tabular-nums">
                {formatQualityPct(homeQualityPct)}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Quality</p>
            </div>
            <div className="text-center py-2.5 px-1 bg-muted/50 rounded-lg min-w-0">
              <p className="text-lg sm:text-xl font-display font-bold text-foreground tabular-nums">
                {formatHoursHoursMinutes(homeTimeInBedHours)}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Time in bed</p>
            </div>
            <div className="text-center py-2.5 px-1 bg-muted/50 rounded-lg min-w-0">
              <p className="text-lg sm:text-xl font-display font-bold text-foreground tabular-nums">
                {formatDebtHours(homeDebt7d)}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Debt (7d)</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border/40 bg-sleep-light/30 dark:bg-sleep/10 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Today&apos;s suggestion
            </p>
            {dailyActionChoice === null ? (
              <>
                <p className="text-sm text-foreground leading-snug">{dailyAction.headline}</p>
                {dailyAction.detail ? (
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{dailyAction.detail}</p>
                ) : null}
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      writeDailyActionChoice(todayStr, 'accepted');
                      setDailyActionChoice('accepted');
                      toast.success('Great — we’ll cheer you on.');
                      if (dailyAction.acceptOpenSleepLog) openSleepCheckIn();
                      else if (dailyAction.acceptNavigate) navigate(dailyAction.acceptNavigate);
                    }}
                  >
                    {dailyAction.acceptLabel ?? 'Sounds good'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      writeDailyActionChoice(todayStr, 'declined');
                      setDailyActionChoice('declined');
                      toast.message('No problem — we can try again tomorrow.');
                    }}
                  >
                    Not today
                  </Button>
                </div>
              </>
            ) : dailyActionChoice === 'accepted' ? (
              <p className="text-xs text-muted-foreground leading-relaxed">
                You accepted this nudge for today. Tap the card anytime for the full Sleep page.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground leading-relaxed">
                You skipped this suggestion for today. A fresh one will show tomorrow.
              </p>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-border/40 bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Plan for today
            </p>
            <ul className="space-y-2 text-xs leading-relaxed text-foreground">
              {homeSuggestions.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 font-bold text-accent" aria-hidden>
                    ·
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                openSleepCheckIn();
              }}
            >
              <ClipboardList className="w-4 h-4" />
              Log last night
            </Button>
          </div>

          {homeStatsSource ? (
            <p className="text-[10px] text-muted-foreground mt-3">
              Quality &amp; time: {homeStatsSource}. Debt sums short nights you logged.
            </p>
          ) : null}
        </div>

        {/* Tasks — tap card for tasks page; checkboxes stay local */}
        <div
          role="link"
          tabIndex={0}
          aria-label="Tasks — open tasks page"
          className="luna-card-interactive w-full cursor-pointer p-4 text-left animate-fade-in-delay"
          onClick={() => navigate('/tasks')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/tasks');
            }
          }}
        >
          <div className="mb-1 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Tasks</h2>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                Priority first, then planned or due time
              </p>
            </div>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          </div>
          {loadingTasks ? (
            <p className="py-3 text-sm text-muted-foreground">Loading tasks...</p>
          ) : taskError ? (
            <p className="py-3 text-sm text-red-500">Error: {taskError}</p>
          ) : mergedTodayTasks.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">
              Nothing due or planned for today. Add tasks or open the calendar to plan blocks.
            </p>
          ) : (
            mergedTodayTasks.map((task) => (
              <div
                key={task.task_id}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <TaskItem
                  taskId={task.task_id}
                  title={task.title}
                  subtitle={task.notes ?? undefined}
                  category={task.category}
                  priority={task.priority}
                  duration={task.estimated_minutes && task.estimated_minutes > 0 ? task.estimated_minutes : undefined}
                  plannedDate={formatDateTime(task.planned_datetime)}
                  dueDate={formatDate(task.due_datetime)}
                  completed={task.status === 'completed'}
                  pastDue={isTaskPastDue(task.status, task.due_datetime)}
                  completing={updatingTaskId === task.task_id}
                  onToggleComplete={(checked) => handleTaskCompletion(task.task_id, checked)}
                />
              </div>
            ))
          )}
        </div>

        {/* Calendar — tap card for full calendar */}
        <div
          role="link"
          tabIndex={0}
          aria-label="Calendar — open calendar page"
          className="luna-card-interactive w-full cursor-pointer p-4 text-left animate-fade-in-delay-2"
          onClick={() => navigate('/calendar')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/calendar');
            }
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Calendar</h2>
            <ChevronRight className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">{todayLabel}</p>

          {!token ? (
            <p className="text-sm text-muted-foreground py-2">Sign in to see your calendar.</p>
          ) : calLoading ? (
            <p className="text-sm text-muted-foreground py-2">Loading events…</p>
          ) : calError ? (
            <p className="text-sm text-red-500 py-2">{calError}</p>
          ) : (
            <>
              {allDayRows.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {allDayRows.map((ev) => (
                    <span
                      key={ev.event_id}
                      className={`text-[10px] font-medium rounded-md px-2 py-0.5 truncate max-w-full ${getEventStyle(ev.source)}`}
                    >
                      All day · {ev.title || 'Event'}
                    </span>
                  ))}
                </div>
              ) : null}

              <div
                className="flex rounded-lg border border-border/30 overflow-hidden mb-3 transition-[height] duration-300 ease-out bg-muted/30"
                style={{ height: homeMiniTimeline.heightPx, minHeight: homeMiniTimeline.heightPx }}
              >
                <div
                  className="w-14 flex-shrink-0 border-r border-border/30 bg-muted/50 relative"
                  style={{ height: homeMiniTimeline.heightPx }}
                >
                  {homeMiniTimeline.hourTicks.map((h) => (
                    <div
                      key={h.ms}
                      className="absolute left-1.5 right-0.5 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums leading-none pointer-events-none"
                      style={{ top: `${homeMiniTimeline.pct(h.ms)}%` }}
                    >
                      {h.label}
                    </div>
                  ))}
                </div>
                <div
                  className="flex-1 relative min-w-0 bg-muted/25"
                  style={{ height: homeMiniTimeline.heightPx }}
                >
                  {homeMiniTimeline.hourTicks.map((h) => (
                    <div
                      key={h.ms}
                      className="absolute left-0 right-0 border-t border-border/40 pointer-events-none z-[1]"
                      style={{ top: `${homeMiniTimeline.pct(h.ms)}%` }}
                    />
                  ))}
                  <div
                    className="absolute left-0 right-0 top-0 z-[2] pointer-events-none flex items-center gap-2"
                  >
                    <div className="w-2 h-2 rounded-full bg-destructive flex-shrink-0" />
                    <div className="flex-1 h-px bg-destructive/80" />
                    <span className="text-[10px] font-medium text-destructive pr-2">
                      {DateTime.fromJSDate(nowTick).setZone(zone).toFormat('h:mm a')}
                    </span>
                  </div>
                  {upcomingTimedRows.map((ev) => {
                    const { viewStartMs, viewEndMs, denom, pct, heightPx } = homeMiniTimeline;
                    const clipStart = Math.max(ev.start.getTime(), viewStartMs);
                    const clipEnd = Math.min(ev.end.getTime(), viewEndMs);
                    if (clipEnd <= clipStart) return null;
                    const top = pct(clipStart);
                    const rawPct = ((clipEnd - clipStart) / denom) * 100;
                    const estPx = (rawPct / 100) * heightPx;
                    const minPx = 26;
                    return (
                      <div
                        key={ev.event_id}
                        className={`absolute left-2 right-2 rounded-md px-2 py-1.5 text-xs font-medium leading-snug overflow-hidden z-[3] shadow-sm ${getEventStyle(ev.source)}`}
                        style={{
                          top: `${top}%`,
                          height: `${rawPct}%`,
                          minHeight: estPx < minPx ? minPx : undefined,
                        }}
                        title={ev.title || 'Event'}
                      >
                        <span className="line-clamp-2">{ev.title || 'Event'}</span>
                      </div>
                    );
                  })}
                  {upcomingTimedRows.length === 0 && allDayRows.length === 0 ? (
                    <div className="absolute inset-0 z-[4] flex items-center justify-center px-3 text-center pointer-events-none">
                      <p className="text-[11px] text-muted-foreground bg-background/80 rounded-md px-2 py-1.5 border border-border/40">
                        No events scheduled today
                      </p>
                    </div>
                  ) : upcomingTimedRows.length === 0 ? (
                    <div className="absolute inset-0 z-[4] flex items-center justify-center px-3 text-center pointer-events-none">
                      <p className="text-[11px] text-muted-foreground bg-background/80 rounded-md px-2 py-1.5 border border-border/40">
                        No upcoming timed events
                        {allDayRows.length > 0 ? ' — all-day above' : ''}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              {upcomingTimedRows.length > 0 ? (
                <ul className="space-y-2">
                  {upcomingTimedRows.map((ev) => {
                    const ongoing = ev.start.getTime() <= nowTick.getTime();
                    const startL = DateTime.fromJSDate(ev.start).setZone(zone).toFormat('h:mm a');
                    const endL = DateTime.fromJSDate(ev.end).setZone(zone).toFormat('h:mm a');
                    return (
                      <li
                        key={ev.event_id}
                        className="flex gap-2 text-xs text-foreground"
                      >
                        <span className="w-16 flex-shrink-0 font-medium tabular-nums">
                          {ongoing ? 'Now' : startL}
                        </span>
                        <span className="truncate">
                          <span className="text-muted-foreground mr-1">
                            {startL === endL ? '' : `– ${endL}`}
                          </span>
                          {ev.title || 'Event'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </>
          )}
        </div>

      </div>
    </div>
  );
};

export default Home;
