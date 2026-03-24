import PageHeader from '@/components/PageHeader';
import TaskItem from '@/components/TaskItem';
import EmotionalCheckIn from '@/components/EmotionalCheckIn';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiJson } from '@/lib/api';
import {
  effectiveTimeZone,
  parseApiTimestamp,
  parseApiTimestampToDate,
} from '@/lib/calendarTime';
import { DateTime } from 'luxon';
import { Moon, Flame, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';

interface Task {
  task_id?: string;
  title: string;
  notes?: string | null;
  priority: number;
  status: string;
  estimated_minutes: number;
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

function getEventStyle(source?: string | null) {
  if (source === 'task_planned') return 'bg-accent/15 border border-accent/30 text-foreground';
  if (source === 'task_due') return 'bg-accent/25 border border-accent/40 text-foreground';
  if (source === 'ics') return 'bg-cognitive-medium text-foreground';
  return 'bg-cognitive-low text-foreground';
}

const Home = () => {
  const { token, user } = useAuth();
  const { bedtime, streak } = useApp();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [taskError, setTaskError] = useState<string | null>(null);

  const zone = useMemo(() => effectiveTimeZone(user?.timezone), [user?.timezone]);
  const { todayStr, tomorrowStr, todayLabel } = useMemo(() => {
    const now = DateTime.now().setZone(zone);
    return {
      todayStr: now.toFormat('yyyy-MM-dd'),
      tomorrowStr: now.plus({ days: 1 }).toFormat('yyyy-MM-dd'),
      todayLabel: now.toFormat('EEEE, MMM d'),
    };
  }, [zone]);

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

  /** Future-only window: ≥6h ahead, stretches to last upcoming event, capped at midnight. */
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
    /** ~56px per hour → roomy blocks; clamp so very long days don’t dominate. */
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

  const isToday = (dateString: string | null | undefined) => {
    if (!dateString) return false;
    const taskDate = new Date(dateString);
    const today = new Date();

    return (
      taskDate.getFullYear() === today.getFullYear() &&
      taskDate.getMonth() === today.getMonth() &&
      taskDate.getDate() === today.getDate()
    );
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return undefined;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const homepageTasks = tasks.filter(
    (task) =>
      task.status !== 'completed' &&
      task.priority === 1,
  );
  const todayTasks = tasks.filter(
    (task) =>
      task.status !== 'completed' &&
      isToday(task.due_datetime),
  );

  return (
    <div>
      <PageHeader title="" compact />

      <div className="px-5 -mt-2 space-y-4 pb-6">
        {/* Tonight's Plan */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-sleep-light flex items-center justify-center">
                <Moon className="w-5 h-5 text-sleep" />
              </div>
              <div>
                <p className="text-lg font-display font-semibold text-foreground">{bedtime}</p>
                <p className="text-xs text-muted-foreground">Bedtime</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1.5">
                <Flame className="w-4 h-4 text-warning" />
                <span className="text-sm font-semibold text-foreground">{streak}</span>
                <span className="text-xs text-muted-foreground">day streak</span>
              </div>
            </div>
          </div>
        </div>

        {/* Last Night Stats - moved under sleep goal */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50 animate-fade-in-delay">
          <h2 className="text-sm font-semibold text-foreground mb-3">Last Night</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center py-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-display font-bold text-foreground">87%</p>
              <p className="text-xs text-muted-foreground">sleep quality</p>
            </div>
            <div className="text-center py-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-display font-bold text-foreground">8h32m</p>
              <p className="text-xs text-muted-foreground">time in bed</p>
            </div>
          </div>
        </div>

        {/* Emotional Check-In */}
        <div className="animate-fade-in-delay">
          <EmotionalCheckIn />
        </div>

        {/* Priority Tasks */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50 animate-fade-in-delay">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-foreground">Priority</h2>
            <button
              onClick={() => navigate('/tasks')}
              className="text-xs text-accent font-medium flex items-center gap-0.5"
            >
              All tasks <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {loadingTasks ? (
            <p className="py-3 text-sm text-muted-foreground">Loading tasks...</p>
          ) : taskError ? (
            <p className="py-3 text-sm text-red-500">Error: {taskError}</p>
          ) : homepageTasks.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">No priority tasks for today.</p>
          ) : (
            homepageTasks.map((task) => (
              <TaskItem
                key={task.task_id}
                title={task.title}
                subtitle={task.notes}
                category={task.category}
                duration={task.estimated_minutes && task.estimated_minutes > 0 ? task.estimated_minutes : undefined}
                dueDate={formatDate(task.due_datetime)}
                completed={task.status === 'completed'}
              />
            ))
          )}
        </div>

        {/* Today's Tasks */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50 animate-fade-in-delay">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-foreground">Today's Tasks</h2>
            <button
              onClick={() => navigate('/tasks')}
              className="text-xs text-accent font-medium flex items-center gap-0.5"
            >
              All tasks <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {loadingTasks ? (
            <p className="py-3 text-sm text-muted-foreground">Loading tasks...</p>
          ) : taskError ? (
            <p className="py-3 text-sm text-red-500">Error: {taskError}</p>
          ) : todayTasks.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">No tasks due today.</p>
          ) : (
            todayTasks.map((task) => (
              <TaskItem
                key={task.task_id}
                title={task.title}
                subtitle={task.notes}
                category={task.category}
                duration={task.estimated_minutes && task.estimated_minutes > 0 ? task.estimated_minutes : undefined}
                dueDate={formatDate(task.due_datetime)}
                completed={task.status === 'completed'}
              />
            ))
          )}
        </div>

        {/* Calendar — mini day + today's events */}
        <button
          type="button"
          onClick={() => navigate('/calendar')}
          className="w-full text-left bg-card rounded-xl p-4 shadow-sm border border-border/50 animate-fade-in-delay-2 hover:border-accent/30 transition-colors"
        >
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-semibold text-foreground">Calendar</h2>
            <span className="text-xs text-accent font-medium flex items-center gap-0.5">
              View <ChevronRight className="w-3.5 h-3.5" />
            </span>
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
        </button>
      </div>
    </div>
  );
};

export default Home;
