import PageHeader from '@/components/PageHeader';
import { Sun, Moon, ChevronLeft, ChevronRight, Wand2, Plus, Calendar as CalendarIcon, CheckSquare, Clock3, Trash2, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { format, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths, eachDayOfInterval, isSameDay, isSameMonth, isToday } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { apiJson } from '@/lib/api';
import { isTaskPastDue } from '@/lib/taskOverdue';
import { priorityStarCount } from '@/lib/taskPriority';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import TaskEditModal from '@/components/TaskEditModal';

const hours = Array.from({ length: 24 }, (_, i) => {
  // Start at 3 AM and wrap around to 2 AM
  const h = (i + 3) % 24;
  const ampm = h >= 12 ? 'pm' : 'am';
  const raw = h % 12;
  const display = raw === 0 ? 12 : raw;
  return { hour: h, label: `${display}:00 ${ampm}` };
});

type DbEvent = {
  event_id: string;
  task_id?: string | null;
  title: string | null;
  description: string | null;
  start_datetime: string;
  end_datetime: string;
  source: string | null;
  is_all_day?: boolean | null;
  task_due_datetime?: string | null;
  task_status?: string | null;
  task_priority?: number | null;
};

function calendarTaskPastDue(e: DbEvent): boolean {
  if (!(e.source === 'task_planned' || e.source === 'task_due') || !e.task_id) return false;
  return isTaskPastDue(e.task_status ?? 'pending', e.task_due_datetime);
}

function LatePill({ compact }: { compact?: boolean }) {
  return (
    <span
      className={
        compact
          ? 'inline-flex shrink-0 items-center rounded-full border border-orange-500/35 bg-orange-500/10 px-1 py-0 text-[9px] font-semibold text-orange-700 dark:text-orange-400'
          : 'inline-flex shrink-0 items-center rounded-full border border-orange-500/35 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:text-orange-400'
      }
      aria-label="Late"
    >
      Late
    </span>
  );
}

function taskPriorityStars(event: DbEvent, compact: boolean) {
  const n =
    event.task_id && event.task_priority != null
      ? priorityStarCount(Number(event.task_priority))
      : 0;
  if (n === 0) return null;
  const size = compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5';
  const title = n === 2 ? 'High priority' : 'Medium priority';
  return (
    <span className="inline-flex items-center gap-0.5 text-warning flex-shrink-0" title={title}>
      {Array.from({ length: n }).map((_, i) => (
        <Star key={i} className={`${size} fill-warning text-warning`} aria-hidden />
      ))}
    </span>
  );
}

type SleepGoalResponse = {
  goal: {
    target_bedtime: string | null;
    target_wake_time: string | null;
  } | null;
  windows: Array<{
    day_of_week: number;
    start_time: string;
    end_time: string;
  }>;
};

type ScheduleSuggestions = {
  conflicts?: Array<{
    event_id: string;
    title: string | null;
    suggested_start_datetime: string | null;
    suggested_end_datetime: string | null;
  }>;
};

type Task = {
  task_id: string;
  title: string;
  notes?: string;
  priority: number;
  status: string;
  estimated_minutes: number;
  planned_datetime?: string;
  due_datetime?: string;
};

function fmtPgLocal(ts?: string | null) {
  if (!ts) return '';
  // expects "YYYY-MM-DD HH:MM:SS"
  const d = new Date(ts.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return ts;
  return format(d, 'MMM d, h:mm a');
}

function hourFloatFromDate(d: Date) {
  return d.getHours() + d.getMinutes() / 60;
}

function timeTo12Hour(timeStr: string) {
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  const d = new Date(2000, 0, 1, h || 0, m || 0);
  return format(d, 'h:mm a');
}

type CalendarView = 'day' | 'week' | 'month';

const CalendarPage = () => {
  const { token } = useAuth();
  const [day, setDay] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<CalendarView>('day');
  const [events, setEvents] = useState<DbEvent[]>([]);
  const [sleep, setSleep] = useState<SleepGoalResponse | null>(null);
  const [suggestions, setSuggestions] = useState<ScheduleSuggestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createStartTime, setCreateStartTime] = useState('09:00');
  const [createEndTime, setCreateEndTime] = useState('10:00');
  const [createAllDay, setCreateAllDay] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingEvent, setEditingEvent] = useState<DbEvent | null>(null);
  const [editingEventTitle, setEditingEventTitle] = useState('');
  const [editingEventDescription, setEditingEventDescription] = useState('');
  const [editingEventStart, setEditingEventStart] = useState('');
  const [editingEventEnd, setEditingEventEnd] = useState('');
  const [editingEventAllDay, setEditingEventAllDay] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);

  const dateStr = useMemo(() => format(day, 'yyyy-MM-dd'), [day]);

  const fetchRange = useMemo(() => {
    if (viewMode === 'day') {
      return { from: dateStr, to: format(addDays(day, 2), 'yyyy-MM-dd') };
    }
    if (viewMode === 'week') {
      const start = startOfWeek(day, { weekStartsOn: 0 });
      const end = endOfWeek(day, { weekStartsOn: 0 });
      return { from: format(start, 'yyyy-MM-dd'), to: format(addDays(end, 1), 'yyyy-MM-dd') };
    }
    const start = startOfMonth(day);
    const end = endOfMonth(day);
    return { from: format(start, 'yyyy-MM-dd'), to: format(addDays(end, 1), 'yyyy-MM-dd') };
  }, [viewMode, day, dateStr]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      setLoading(true);
      try {
        const [goalRes, evRes] = await Promise.all([
          apiJson<SleepGoalResponse>('/api/me/sleep-goal', { token }),
          apiJson<DbEvent[]>(
            `/api/me/calendar-events?from=${encodeURIComponent(`${fetchRange.from} 00:00:00`)}&to=${encodeURIComponent(`${fetchRange.to} 00:00:00`)}`,
            { token },
          ),
        ]);
        if (cancelled) return;
        setSleep(goalRes);
        setEvents(evRes);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, fetchRange.from, fetchRange.to]);

  const dow = day.getDay();
  const windowForDay = useMemo(() => {
    const w = (sleep?.windows || []).find((x) => x.day_of_week === dow);
    return w || null;
  }, [sleep, dow]);

  const sleepTimes = useMemo(() => {
    // If we have a suggestion, shade the calendar using the suggested sleep window.
    const suggestedStart = suggestions?.sleep_window?.start ? new Date(String(suggestions.sleep_window.start).replace(' ', 'T')) : null;
    const suggestedEnd = suggestions?.sleep_window?.end ? new Date(String(suggestions.sleep_window.end).replace(' ', 'T')) : null;
    if (
      suggestedStart &&
      suggestedEnd &&
      !Number.isNaN(suggestedStart.getTime()) &&
      !Number.isNaN(suggestedEnd.getTime())
    ) {
      return {
        bedHour: hourFloatFromDate(suggestedStart),
        wakeHour: hourFloatFromDate(suggestedEnd),
        label: `${format(suggestedStart, 'h:mm a')} – ${format(suggestedEnd, 'h:mm a')}`,
        source: 'suggested',
      };
    }

    const bed = String(windowForDay?.start_time || sleep?.goal?.target_bedtime || '23:00:00').slice(0, 5);
    const wake = String(windowForDay?.end_time || sleep?.goal?.target_wake_time || '07:00:00').slice(0, 5);
    const [bh, bm] = bed.split(':').map(Number);
    const [wh, wm] = wake.split(':').map(Number);
    return {
      bedHour: (bh || 0) + (bm || 0) / 60,
      wakeHour: (wh || 0) + (wm || 0) / 60,
      label: `${timeTo12Hour(bed)} – ${timeTo12Hour(wake)}`,
      source: 'saved',
    };
  }, [windowForDay, sleep, suggestions]);

  const getEventStyle = (source?: string | null) => {
    if (source === 'task_planned') return 'bg-accent/15 border border-accent/30 text-foreground';
    if (source === 'task_due') return 'bg-accent/25 border border-accent/40 text-foreground';
    if (source === 'ics') return 'bg-cognitive-medium text-foreground';
    return 'bg-cognitive-low text-foreground';
  };

  const eventsForDay = useMemo(() => {
    const start = new Date(`${dateStr}T00:00:00`);
    const end = new Date(addDays(start, 1).getTime());
    return events
      .map((e) => ({ ...e, start: new Date(e.start_datetime), end: new Date(e.end_datetime) }))
      .filter((e) => e.start < end && e.end > start)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [events, dateStr]);

  const weekDays = useMemo(() => {
    if (viewMode !== 'week') return [];
    const start = startOfWeek(day, { weekStartsOn: 0 });
    const end = endOfWeek(day, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [viewMode, day]);

  const sleepTimesByDow = useMemo(() => {
    const byDow: Record<number, { bedHour: number; wakeHour: number }> = {};
    const defaultBed = String(sleep?.goal?.target_bedtime || '23:00:00').slice(0, 5);
    const defaultWake = String(sleep?.goal?.target_wake_time || '07:00:00').slice(0, 5);
    for (let dow = 0; dow < 7; dow++) {
      const w = (sleep?.windows || []).find((x) => x.day_of_week === dow);
      const bed = String(w?.start_time || defaultBed).slice(0, 5);
      const wake = String(w?.end_time || defaultWake).slice(0, 5);
      const [bh, bm] = bed.split(':').map(Number);
      const [wh, wm] = wake.split(':').map(Number);
      byDow[dow] = {
        bedHour: (bh || 0) + (bm || 0) / 60,
        wakeHour: (wh || 0) + (wm || 0) / 60,
      };
    }
    return byDow;
  }, [sleep]);

  const eventsForWeekDay = useMemo(() => {
    const byDay: Record<string, Array<{ event: DbEvent; start: Date; end: Date }>> = {};
    weekDays.forEach((d) => {
      const key = format(d, 'yyyy-MM-dd');
      byDay[key] = [];
    });
    events.forEach((e) => {
      const start = new Date(e.start_datetime);
      const end = new Date(e.end_datetime);
      weekDays.forEach((d) => {
        const dayStart = new Date(d);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(d);
        dayEnd.setHours(23, 59, 59, 999);
        if (start < dayEnd && end > dayStart) {
          byDay[format(d, 'yyyy-MM-dd')].push({ event: e, start, end });
        }
      });
    });
    Object.keys(byDay).forEach((k) => byDay[k].sort((a, b) => a.start.getTime() - b.start.getTime()));
    return byDay;
  }, [events, weekDays]);

  const monthGrid = useMemo(() => {
    if (viewMode !== 'month') return { days: [] as Date[], firstDay: 0 };
    const start = startOfMonth(day);
    const end = endOfMonth(day);
    const firstDow = start.getDay();
    const padStart = firstDow;
    const totalCells = Math.ceil((padStart + end.getDate()) / 7) * 7;
    const days: Date[] = [];
    const first = new Date(start);
    first.setDate(first.getDate() - padStart);
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(first);
      d.setDate(first.getDate() + i);
      days.push(d);
    }
    return { days, firstDay: firstDow };
  }, [viewMode, day]);

  const eventsForMonthDay = useMemo(() => {
    const byDay: Record<string, Array<{ event: DbEvent; start: Date; end: Date }>> = {};
    monthGrid.days.forEach((d) => {
      const key = format(d, 'yyyy-MM-dd');
      byDay[key] = [];
    });
    events.forEach((e) => {
      const start = new Date(e.start_datetime);
      const end = new Date(e.end_datetime);
      monthGrid.days.forEach((d) => {
        const dayStart = new Date(d);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(d);
        dayEnd.setHours(23, 59, 59, 999);
        if (start < dayEnd && end > dayStart) {
          byDay[format(d, 'yyyy-MM-dd')].push({ event: e, start, end });
        }
      });
    });
    Object.keys(byDay).forEach((k) => byDay[k].sort((a, b) => a.start.getTime() - b.start.getTime()));
    return byDay;
  }, [events, monthGrid.days]);

  // Current time line: only for today, position based on hour (3am = 0)
  const [now, setNow] = useState(() => new Date());
  const isViewingToday = dateStr === format(new Date(), 'yyyy-MM-dd');
  useEffect(() => {
    if (!isViewingToday) return;
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [isViewingToday]);
  const currentTimeTopPercent = useMemo(() => {
    if (!isViewingToday) return null;
    const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    const hoursFrom3am = (hour - 3 + 24) % 24;
    return (hoursFrom3am / 24) * 100;
  }, [isViewingToday, now]);

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Calendar" compact />

      <div className="px-5 -mt-2 pb-6">
        {/* View switcher + Date picker */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="flex rounded-lg border-2 border-border bg-card shadow-sm overflow-hidden flex-shrink-0">
            {(['day', 'week', 'month'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewMode(v)}
                className={`px-4 py-2.5 text-sm font-semibold capitalize transition-colors ${
                  viewMode === v
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="bg-card rounded-xl p-3 shadow-sm border border-border/50 flex-1 flex items-center justify-between">
            <button
              className="p-1"
              onClick={() =>
                setDay((d) =>
                  viewMode === 'day' ? subDays(d, 1) : viewMode === 'week' ? subWeeks(d, 1) : subMonths(d, 1)
                )
              }
              aria-label="Previous"
            >
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                {viewMode === 'day' && (
                  <>
                    <span className="font-medium text-foreground">{format(day, 'MMM')}</span>
                    <span className="text-muted-foreground">{format(day, 'd')}</span>
                    <span className="text-muted-foreground">{format(day, 'yyyy')}</span>
                  </>
                )}
                {viewMode === 'week' && (
                  <span className="font-medium text-foreground">
                    {format(startOfWeek(day, { weekStartsOn: 0 }), 'MMM d')} – {format(endOfWeek(day, { weekStartsOn: 0 }), 'MMM d')}
                  </span>
                )}
                {viewMode === 'month' && (
                  <span className="font-medium text-foreground">{format(day, 'MMMM yyyy')}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDay(new Date())}
                className="text-xs font-medium text-accent hover:underline"
              >
                Today
              </button>
            </div>
            <button
              className="p-1"
              onClick={() =>
                setDay((d) =>
                  viewMode === 'day' ? addDays(d, 1) : viewMode === 'week' ? addWeeks(d, 1) : addMonths(d, 1)
                )
              }
              aria-label="Next"
            >
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Sleep window protected - at top (day view only) */}
        {viewMode === 'day' && (
        <div className="mb-4 bg-sleep-light border border-sleep/20 rounded-xl p-3">
          <p className="text-xs text-foreground">
            <Moon className="w-3.5 h-3.5 inline mr-1 text-sleep" />
            <span className="font-medium">Sleep window protected:</span> {sleepTimes.label}. Scheduling here will trigger a gentle warning.
          </p>
        </div>
        )}

        {viewMode === 'day' && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground">
            Sleep window: <span className="text-foreground/80">{sleepTimes.label}</span>
            {sleepTimes.source === 'suggested' ? <span className="text-muted-foreground"> (suggested)</span> : null}
          </p>
          <button
            onClick={async () => {
              if (!token) return;
              const res = await apiJson<ScheduleSuggestions>('/api/me/schedule/suggestions', {
                method: 'POST',
                token,
                body: JSON.stringify({ date: dateStr }),
              });
              setSuggestions(res);
            }}
            className="text-xs font-medium text-accent flex items-center gap-1"
          >
            <Wand2 className="w-3.5 h-3.5" /> Suggest shifts
          </button>
        </div>
        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    Add event
                  </DialogTitle>
                  <DialogDescription>
                    Create a manual calendar event for {format(day, 'MMM d, yyyy')}.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Title</label>
                    <Input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="e.g. Study session" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Description (optional)</label>
                    <Textarea
                      value={createDescription}
                      onChange={(e) => setCreateDescription(e.target.value)}
                      placeholder="Notes…"
                      className="min-h-[90px]"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={createAllDay}
                        onChange={(e) => setCreateAllDay(e.target.checked)}
                        className="accent-accent"
                      />
                      All day
                    </label>

                    <div className="flex items-center gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground">Start</label>
                        <Input
                          type="time"
                          value={createStartTime}
                          onChange={(e) => setCreateStartTime(e.target.value)}
                          disabled={createAllDay}
                          className="h-9 w-[130px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground">End</label>
                        <Input
                          type="time"
                          value={createEndTime}
                          onChange={(e) => setCreateEndTime(e.target.value)}
                          disabled={createAllDay}
                          className="h-9 w-[130px]"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!token) return;
                      setCreating(true);
                      try {
                        const title = createTitle.trim();
                        const start = createAllDay ? `${dateStr}T00:00:00` : `${dateStr}T${createStartTime}:00`;
                        const end = createAllDay ? `${dateStr}T23:59:59` : `${dateStr}T${createEndTime}:00`;
                        const created = await apiJson<DbEvent>('/api/me/calendar-events', {
                          method: 'POST',
                          token,
                          body: JSON.stringify({
                            title: title.length ? title : null,
                            description: createDescription.trim().length ? createDescription.trim() : null,
                            start_datetime: start,
                            end_datetime: end,
                            is_all_day: createAllDay,
                            source: 'manual',
                            status: 'scheduled',
                          }),
                        });
                        setEvents((prev) => [...prev, created]);
                        setCreateOpen(false);
                        setCreateTitle('');
                        setCreateDescription('');
                        setCreateStartTime('09:00');
                        setCreateEndTime('10:00');
                        setCreateAllDay(false);
                      } finally {
                        setCreating(false);
                      }
                    }}
                    disabled={creating}
                  >
                    {creating ? 'Adding…' : 'Add'}
                  </Button>
                </DialogFooter>
              </DialogContent>
        </Dialog>

        {/* Suggested sleep window (day view only) */}
        {viewMode === 'day' && suggestions?.sleep_window?.start && suggestions?.sleep_window?.end ? (
          <div className="mb-4 bg-card border border-border/50 rounded-xl p-3">
            <p className="text-xs text-foreground font-medium mb-1">Suggested sleep window</p>
            <p className="text-xs text-muted-foreground">
              {fmtPgLocal(suggestions.sleep_window.start)} – {fmtPgLocal(suggestions.sleep_window.end)}
              {suggestions?.moved_sleep_window ? (
                <span className="text-muted-foreground"> (adjusted to fit your schedule)</span>
              ) : null}
            </p>
            {suggestions?.warning ? (
              <p className="text-xs text-muted-foreground mt-1">{String(suggestions.warning)}</p>
            ) : null}
          </div>
        ) : null}

        {/* Day view */}
        <div className={viewMode === 'day' ? 'block' : 'hidden'}>
        <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden">
          <div className="relative">
            {/* Current time indicator - only on today */}
            {isViewingToday && currentTimeTopPercent != null && (
              <div
                className="absolute left-32 right-0 z-10 pointer-events-none flex items-center gap-2"
                style={{ top: `${currentTimeTopPercent}%` }}
              >
                <div className="w-2 h-2 rounded-full bg-destructive flex-shrink-0" />
                <div className="flex-1 h-px bg-destructive/80" />
                <span className="text-[10px] font-medium text-destructive pr-2">
                  {format(now, 'h:mm a')}
                </span>
              </div>
            )}
            {hours.map(({ hour, label }) => {
              const eventStarts = eventsForDay.filter((e) => e.start.getHours() === hour);
              const inSleepWindow =
                sleepTimes.bedHour >= sleepTimes.wakeHour
                  ? hour >= Math.floor(sleepTimes.bedHour) || hour < Math.floor(sleepTimes.wakeHour)
                  : hour >= Math.floor(sleepTimes.bedHour) && hour < Math.floor(sleepTimes.wakeHour);
              const inWakeWindow = hour >= Math.floor(sleepTimes.wakeHour) && hour < Math.floor(sleepTimes.wakeHour) + 1;
              const isWakeRow = hour === Math.floor(sleepTimes.wakeHour);
              const isBedRow = hour === Math.floor(sleepTimes.bedHour);

              return (
                <div
                  key={hour}
                  className={`relative flex border-b border-border/30 min-h-[3rem] ${
                    inSleepWindow ? 'sleep-window-bg' : inWakeWindow ? 'wake-window-bg' : ''
                  }`}
                >
                  {isWakeRow && (
                    <>
                      <div className="absolute top-0 left-0 right-0 h-px bg-warning/60 z-10" />
                      <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10">
                        <Sun className="w-4 h-4 text-warning" />
                      </div>
                    </>
                  )}
                  {isBedRow && (
                    <>
                      <div className="absolute top-0 left-0 right-0 h-px bg-sleep/60 z-10" />
                      <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10">
                        <Moon className="w-4 h-4 text-sleep" />
                      </div>
                    </>
                  )}
                  <div className="w-12 flex-shrink-0" />
                  <div className="w-20 py-2 px-3 text-[11px] text-muted-foreground flex-shrink-0 border-r border-border/30">
                    {label}
                  </div>
                  <div className="flex-1 p-1 relative">
                    {eventStarts.map((event) => (
                      <button
                        key={event.event_id}
                        type="button"
                        onClick={async () => {
                          if (!token) return;
                          if ((event.source === 'task_planned' || event.source === 'task_due') && event.task_id) {
                            const task = await apiJson<Task>(`/api/me/tasks/${event.task_id}`, { token });
                            setEditingTask(task);
                          } else {
                            setEditingEvent(event);
                            setEditingEventTitle(event.title || '');
                            setEditingEventDescription(event.description || '');
                            const toLocalInput = (value: string) => {
                              const d = new Date(value);
                              if (Number.isNaN(d.getTime())) return '';
                              const year = d.getFullYear();
                              const month = String(d.getMonth() + 1).padStart(2, '0');
                              const day = String(d.getDate()).padStart(2, '0');
                              const hours = String(d.getHours()).padStart(2, '0');
                              const minutes = String(d.getMinutes()).padStart(2, '0');
                              return `${year}-${month}-${day}T${hours}:${minutes}`;
                            };
                            setEditingEventStart(toLocalInput(event.start_datetime));
                            setEditingEventEnd(toLocalInput(event.end_datetime));
                            setEditingEventAllDay(Boolean(event.is_all_day));
                          }
                        }}
                        className={`w-full text-left rounded-md px-2.5 py-1.5 text-xs font-medium ${getEventStyle(event.source)} mb-1`}
                      >
                        <div className="flex items-center gap-1.5">
                          {event.source === 'task_planned' ? (
                            <CheckSquare className="w-3.5 h-3.5 text-accent" />
                          ) : event.source === 'task_due' ? (
                            <Clock3 className="w-3.5 h-3.5 text-accent" />
                          ) : inWakeWindow ? (
                            <Sun className="w-3.5 h-3.5" />
                          ) : inSleepWindow ? (
                            <Moon className="w-3.5 h-3.5" />
                          ) : null}
                          {calendarTaskPastDue(event) && <LatePill />}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-sm border ${
                              event.source === 'task_planned'
                                ? 'border-accent/40 text-accent bg-accent/10'
                                : event.source === 'task_due'
                                  ? 'border-accent/60 text-accent bg-accent/20'
                                : 'border-border/40 text-muted-foreground bg-background/40'
                            }`}
                          >
                            {event.source === 'task_planned' ? 'PLANNED TASK' : event.source === 'task_due' ? 'DUE DATE' : 'EVENT'}
                          </span>
                          {taskPriorityStars(event, false)}
                          <span className="truncate">{event.title || 'Event'}</span>
                          <div className="ml-auto flex flex-col items-end gap-0.5 text-[10px] opacity-80">
                            {event.source === 'task_planned' && (
                              <span>
                                planned time {format(event.start, 'MMM d h:mm a')}–{format(event.end, 'h:mm a')}
                              </span>
                            )}
                            {event.source === 'task_due' && (
                              <span>
                                due date {format(event.start, 'MMM d h:mm a')}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </div>

        {/* Week view */}
        <div className={viewMode === 'week' ? 'block' : 'hidden'}>
        <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-x-auto">
          <div className="grid min-w-[600px] border-b border-border" style={{ gridTemplateColumns: '4.5rem repeat(7, minmax(0, 1fr))' }}>
            <div className="py-2 border-r border-border" />
            {weekDays.map((d) => (
              <div
                key={d.toISOString()}
                className={`py-2 text-center text-[11px] border-r border-border last:border-r-0 ${
                  isToday(d) ? 'font-semibold text-accent bg-sleep/20' : 'bg-muted/70 text-muted-foreground'
                }`}
              >
                <div>{format(d, 'EEE')}</div>
                <div className="font-medium text-foreground">{format(d, 'd')}</div>
              </div>
            ))}
          </div>
          <div className="relative">
            {hours.map(({ hour, label }) => (
              <div key={hour} className="grid min-w-[600px] border-b border-border min-h-[2.5rem]" style={{ gridTemplateColumns: '4.5rem repeat(7, minmax(0, 1fr))' }}>
                <div className="py-1 px-2 text-[10px] text-muted-foreground flex-shrink-0 border-r border-border min-w-[4.5rem]">
                  {label}
                </div>
                {weekDays.map((d) => {
                  const dayKey = format(d, 'yyyy-MM-dd');
                  const dow = d.getDay();
                  const st = sleepTimesByDow[dow];
                  const bedHour = st?.bedHour ?? 23;
                  const wakeHour = st?.wakeHour ?? 7;
                  const inSleepWindow = bedHour >= wakeHour
                    ? hour >= Math.floor(bedHour) || hour < Math.floor(wakeHour)
                    : hour >= Math.floor(bedHour) && hour < Math.floor(wakeHour);
                  const inWakeWindow = hour >= Math.floor(wakeHour) && hour < Math.floor(wakeHour) + 1;
                  const hourStart = hour;
                  const hourEnd = hour + 1;
                  const dayEvents = (eventsForWeekDay[dayKey] || []).filter((x) => {
                    const startH = hourFloatFromDate(x.start);
                    const endH = hourFloatFromDate(x.end);
                    return startH < hourEnd && endH > hourStart;
                  });
                  const bgStyles = inSleepWindow ? 'sleep-window-bg' : inWakeWindow ? 'wake-window-bg' : '';
                  return (
                    <div
                      key={dayKey}
                      className={`p-0.5 border-r border-border last:border-r-0 min-h-[2.5rem] ${bgStyles}`}
                    >
                      {dayEvents.map(({ event }) => (
                        <button
                          key={event.event_id}
                          type="button"
                          onClick={async () => {
                            if (!token) return;
                            if ((event.source === 'task_planned' || event.source === 'task_due') && event.task_id) {
                              const task = await apiJson<Task>(`/api/me/tasks/${event.task_id}`, { token });
                              setEditingTask(task);
                            } else {
                              setEditingEvent(event);
                              setEditingEventTitle(event.title || '');
                              setEditingEventDescription(event.description || '');
                              const toLocalInput = (value: string) => {
                                const d = new Date(value);
                                if (Number.isNaN(d.getTime())) return '';
                                const y = d.getFullYear();
                                const m = String(d.getMonth() + 1).padStart(2, '0');
                                const dayNum = String(d.getDate()).padStart(2, '0');
                                const h = String(d.getHours()).padStart(2, '0');
                                const min = String(d.getMinutes()).padStart(2, '0');
                                return `${y}-${m}-${dayNum}T${h}:${min}`;
                              };
                              setEditingEventStart(toLocalInput(event.start_datetime));
                              setEditingEventEnd(toLocalInput(event.end_datetime));
                              setEditingEventAllDay(Boolean(event.is_all_day));
                            }
                          }}
                          className={`w-full text-left rounded px-1.5 py-0.5 text-[10px] truncate flex items-center gap-0.5 ${getEventStyle(event.source)}`}
                        >
                          {calendarTaskPastDue(event) && <LatePill compact />}
                          {taskPriorityStars(event, true)}
                          <span className="truncate">{event.title || 'Event'}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        </div>

        {/* Month view */}
        <div className={viewMode === 'month' ? 'block' : 'hidden'}>
        <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border/30">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((wd) => (
              <div key={wd} className="py-2 text-center text-[10px] font-medium text-muted-foreground border-r border-border/30 last:border-r-0">
                {wd}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthGrid.days.map((d) => {
              const key = format(d, 'yyyy-MM-dd');
              const dayEvents = (eventsForMonthDay[key] || []).slice(0, 3);
              const more = (eventsForMonthDay[key] || []).length - 3;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setDay(d);
                    setViewMode('day');
                  }}
                  className={`min-h-[5rem] p-1.5 border-b border-r border-border/30 w-full text-left hover:bg-muted/40 transition-colors cursor-pointer flex flex-col items-start ${
                    !isSameMonth(d, day) ? 'bg-muted/30' : ''
                  } ${isToday(d) ? 'bg-accent/5' : ''}`}
                >
                  <div
                    className={`text-[11px] mb-1 ${
                      isToday(d) ? 'font-bold text-accent' : isSameMonth(d, day) ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {format(d, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.map(({ event }) => (
                      <button
                        key={event.event_id}
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!token) return;
                          if ((event.source === 'task_planned' || event.source === 'task_due') && event.task_id) {
                            const task = await apiJson<Task>(`/api/me/tasks/${event.task_id}`, { token });
                            setEditingTask(task);
                          } else {
                            setEditingEvent(event);
                            setEditingEventTitle(event.title || '');
                            setEditingEventDescription(event.description || '');
                            const toLocalInput = (value: string) => {
                              const dt = new Date(value);
                              if (Number.isNaN(dt.getTime())) return '';
                              const y = dt.getFullYear();
                              const m = String(dt.getMonth() + 1).padStart(2, '0');
                              const dayNum = String(dt.getDate()).padStart(2, '0');
                              const h = String(dt.getHours()).padStart(2, '0');
                              const min = String(dt.getMinutes()).padStart(2, '0');
                              return `${y}-${m}-${dayNum}T${h}:${min}`;
                            };
                            setEditingEventStart(toLocalInput(event.start_datetime));
                            setEditingEventEnd(toLocalInput(event.end_datetime));
                            setEditingEventAllDay(Boolean(event.is_all_day));
                          }
                        }}
                        className={`w-full text-left rounded px-1 py-0.5 text-[10px] truncate flex items-center gap-0.5 ${getEventStyle(event.source)}`}
                      >
                        {calendarTaskPastDue(event) && <LatePill compact />}
                        {taskPriorityStars(event, true)}
                        <span className="truncate">{event.title || 'Event'}</span>
                      </button>
                    ))}
                    {more > 0 && (
                      <div className="text-[10px] text-muted-foreground px-1">+{more} more</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        </div>

        {/* Conflicts notice - when Suggest shifts finds conflicts */}
        {suggestions?.conflicts?.length ? (
          <div className="mt-4 bg-card border border-border/50 rounded-xl p-3">
            <p className="text-xs text-foreground font-medium mb-2">Conflicts ({suggestions.conflicts.length})</p>
            <div className="space-y-2">
              {suggestions.conflicts.slice(0, 6).map((c: any) => (
                <div key={c.event_id} className="text-xs text-foreground/90 flex items-center gap-2">
                  <div className="min-w-0">
                    <span className="font-medium">{c.title || 'Event'}</span>{' '}
                    <span className="text-muted-foreground">
                      {c.suggested_start_datetime
                        ? `→ ${fmtPgLocal(c.suggested_start_datetime)}–${fmtPgLocal(c.suggested_end_datetime)}`
                        : '(no shift found)'}
                    </span>
                  </div>
                  {c.suggested_start_datetime ? (
                    <button
                      className="ml-auto text-[11px] font-medium text-accent"
                      onClick={async () => {
                        if (!token) return;
                        await apiJson(`/api/me/calendar-events/${encodeURIComponent(c.event_id)}`, {
                          method: 'PUT',
                          token,
                          body: JSON.stringify({
                            start_datetime: c.suggested_start_datetime,
                            end_datetime: c.suggested_end_datetime,
                          }),
                        });

                        const evRes = await apiJson<DbEvent[]>(
                          `/api/me/calendar-events?from=${encodeURIComponent(`${dateStr} 00:00:00`)}&to=${encodeURIComponent(
                            `${format(addDays(day, 2), 'yyyy-MM-dd')} 00:00:00`,
                          )}`,
                          { token },
                        );
                        setEvents(evRes);
                      }}
                    >
                      Apply
                    </button>
                  ) : null}
                </div>
              ))}
              {suggestions.conflicts.length > 6 && <div className="text-xs text-muted-foreground">…and more</div>}
            </div>
          </div>
        ) : null}

        {/* FAB - Add calendar event */}
        <button
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity z-40"
          onClick={() => setCreateOpen(true)}
          aria-label="Add event"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* Task edit from calendar */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          mode="edit"
          onClose={() => setEditingTask(null)}
          onSave={async (updated) => {
            if (!token) throw new Error('Not authenticated');
            await apiJson(`/api/me/tasks/${updated.task_id}`, {
              method: 'PUT',
              token,
              body: JSON.stringify(updated),
            });
            // Refresh events so calendar reflects changes
            const evRes = await apiJson<DbEvent[]>(
              `/api/me/calendar-events?from=${encodeURIComponent(`${dateStr} 00:00:00`)}&to=${encodeURIComponent(
                `${format(addDays(day, 2), 'yyyy-MM-dd')} 00:00:00`,
              )}`,
              { token },
            );
            setEvents(evRes);
          }}
        />
      )}

      {/* Event edit dialog for non-task events */}
      <Dialog
        open={Boolean(editingEvent)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingEvent(null);
            setSavingEvent(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit event</DialogTitle>
            <DialogDescription>Update this calendar event or delete it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Title</label>
              <Input value={editingEventTitle} onChange={(e) => setEditingEventTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Description</label>
              <Textarea
                value={editingEventDescription}
                onChange={(e) => setEditingEventDescription(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={editingEventAllDay}
                  onChange={(e) => setEditingEventAllDay(e.target.checked)}
                />
                All day
              </label>
              <div className="flex items-center gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Start</label>
                  <Input
                    type="datetime-local"
                    value={editingEventStart}
                    onChange={(e) => setEditingEventStart(e.target.value)}
                    disabled={editingEventAllDay}
                    className="h-9 w-[170px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">End</label>
                  <Input
                    type="datetime-local"
                    value={editingEventEnd}
                    onChange={(e) => setEditingEventEnd(e.target.value)}
                    disabled={editingEventAllDay}
                    className="h-9 w-[170px]"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="justify-between">
            <Button
              type="button"
              variant="outline"
              className="text-destructive border-destructive/40"
              disabled={savingEvent || !editingEvent}
              onClick={async () => {
                if (!token || !editingEvent) return;
                setSavingEvent(true);
                try {
                  await apiJson(`/api/me/calendar-events/${editingEvent.event_id}`, {
                    method: 'DELETE',
                    token,
                  });
                  setEvents((prev) => prev.filter((e) => e.event_id !== editingEvent.event_id));
                  setEditingEvent(null);
                } finally {
                  setSavingEvent(false);
                }
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingEvent(null)}
                disabled={savingEvent}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={savingEvent || !editingEvent}
                onClick={async () => {
                  if (!token || !editingEvent) return;
                  setSavingEvent(true);
                  try {
                    const toPgTimestamp = (v: string) =>
                      v && v.includes('T') ? v.replace('T', ' ') + ':00' : v || null;
                    const updated = await apiJson<DbEvent>(`/api/me/calendar-events/${editingEvent.event_id}`, {
                      method: 'PUT',
                      token,
                      body: JSON.stringify({
                        title: editingEventTitle || null,
                        description: editingEventDescription || null,
                        start_datetime: editingEventAllDay ? `${dateStr} 00:00:00` : toPgTimestamp(editingEventStart),
                        end_datetime: editingEventAllDay ? `${dateStr} 23:59:59` : toPgTimestamp(editingEventEnd),
                        is_all_day: editingEventAllDay,
                      }),
                    });
                    setEvents((prev) => prev.map((e) => (e.event_id === updated.event_id ? updated : e)));
                    setEditingEvent(null);
                  } finally {
                    setSavingEvent(false);
                  }
                }}
              >
                {savingEvent ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CalendarPage;
