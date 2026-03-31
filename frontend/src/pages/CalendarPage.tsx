import PageHeader from '@/components/PageHeader';
import {
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Wand2,
  Plus,
  Calendar as CalendarIcon,
  CheckSquare,
  Clock3,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { format, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths, eachDayOfInterval, isSameDay, isSameMonth, isToday } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError, apiJson } from '@/lib/api';
import { isTaskPastDue } from '@/lib/taskOverdue';
import PriorityIndicator from '@/components/PriorityIndicator';
import {
  combineDateAndTimeForApi,
  defaultEndOneHourAfterStart,
  effectiveTimeZone,
  formatTimestampForApi,
  hourFloatInZone,
  parseApiTimestamp,
  parseApiTimestampToDate,
  percentFromHourFloatFrom3am,
  snapMinutesToQuarter,
} from '@/lib/calendarTime';
import { blurNumberInputOnWheel } from '@/lib/utils';
import { DateTime } from 'luxon';
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
  recurrence_series_id?: string | null;
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

function taskPriorityIndicator(event: DbEvent, compact: boolean) {
  if (!event.task_id || event.task_priority == null) return null;
  return <PriorityIndicator priority={Number(event.task_priority)} compact={compact} />;
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
  date?: string;
  goal_type?: string;
  preferred_sleep_window?: { start: string; end: string };
  sleep_window?: { start: string; end: string };
  moved_sleep_window?: boolean;
  warning?: string;
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
  recurrence_series_id?: string | null;
  edit_scope?: 'single' | 'series';
};

function fmtPgLocal(ts: string | null | undefined, zone: string) {
  const dt = parseApiTimestamp(ts, zone);
  if (!dt) return ts ? String(ts) : '';
  return dt.toFormat('MMM d, h:mm a');
}

type DayViewEvent = DbEvent & { start: Date; end: Date };

function timeTo12Hour(timeStr: string) {
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  const d = new Date(2000, 0, 1, h || 0, m || 0);
  return format(d, 'h:mm a');
}

type CalendarView = 'day' | 'week' | 'month';

const CalendarPage = () => {
  const { token, user } = useAuth();
  const zone = useMemo(() => effectiveTimeZone(user?.timezone), [user?.timezone]);
  const [day, setDay] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<CalendarView>('day');
  const [events, setEvents] = useState<DbEvent[]>([]);
  const [sleep, setSleep] = useState<SleepGoalResponse | null>(null);
  const [suggestions, setSuggestions] = useState<ScheduleSuggestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createEventDate, setCreateEventDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [createStartTime, setCreateStartTime] = useState('09:00');
  const [createEndDate, setCreateEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [createEndTime, setCreateEndTime] = useState('10:00');
  const createStartTimeRef = useRef('09:00');
  const [createAllDay, setCreateAllDay] = useState(false);
  const [createRepeat, setCreateRepeat] = useState<'none' | 'daily' | 'weekdays' | 'weekly'>('none');
  const [createRepeatCount, setCreateRepeatCount] = useState(5);
  const [createRepeatUntil, setCreateRepeatUntil] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [sleepWindowConflict, setSleepWindowConflict] = useState<{
    open: boolean;
    title: string;
    start_datetime: string;
    end_datetime: string;
    event_date: string;
    repeat: string;
    repeat_count: number;
    repeat_until: string | null;
    is_all_day: boolean;
    conflictCode: string | null;
    message: string;
    description: string;
  } | null>(null);
  const [sleepWindowConflictError, setSleepWindowConflictError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingEvent, setEditingEvent] = useState<DbEvent | null>(null);
  const [editingEventTitle, setEditingEventTitle] = useState('');
  const [editingEventDescription, setEditingEventDescription] = useState('');
  const [editingStartDate, setEditingStartDate] = useState('');
  const [editingStartTime, setEditingStartTime] = useState('');
  const [editingEndDate, setEditingEndDate] = useState('');
  const [editingEndTime, setEditingEndTime] = useState('');
  const [editingEventAllDay, setEditingEventAllDay] = useState(false);
  const [editingEventScope, setEditingEventScope] = useState<'single' | 'series'>('single');
  const [savingEvent, setSavingEvent] = useState(false);
  const [editingEventError, setEditingEventError] = useState<string | null>(null);

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

  createStartTimeRef.current = createStartTime;

  useEffect(() => {
    if (!createOpen) return;
    setCreateEventDate(dateStr);
    const { endDate, endTime } = defaultEndOneHourAfterStart(dateStr, createStartTimeRef.current, zone);
    setCreateEndDate(endDate);
    setCreateEndTime(endTime);
  }, [createOpen, dateStr, zone]);

  const dow = day.getDay();
  const windowForDay = useMemo(() => {
    const w = (sleep?.windows || []).find((x) => x.day_of_week === dow);
    return w || null;
  }, [sleep, dow]);

  const sleepTimes = useMemo(() => {
    // If we have a suggestion, shade the calendar using the suggested sleep window.
    const s0 = suggestions?.sleep_window?.start ? parseApiTimestamp(String(suggestions.sleep_window.start), zone) : null;
    const s1 = suggestions?.sleep_window?.end ? parseApiTimestamp(String(suggestions.sleep_window.end), zone) : null;
    if (s0 && s1 && s0.isValid && s1.isValid) {
      return {
        bedHour: s0.hour + s0.minute / 60 + s0.second / 3600,
        wakeHour: s1.hour + s1.minute / 60 + s1.second / 3600,
        label: `${s0.toFormat('h:mm a')} – ${s1.toFormat('h:mm a')}`,
        source: 'suggested' as const,
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
      source: 'saved' as const,
    };
  }, [windowForDay, sleep, suggestions]);

  // For overnight sleep windows (bedtime > wake time), early-morning hours
  // on the current calendar day belong to the previous day's "bedtime episode".
  // Backend scheduling also treats those hours as belonging to the previous day.
  const prevWindowForDay = useMemo(() => {
    const prevDow = (dow + 6) % 7;
    const w = (sleep?.windows || []).find((x) => x.day_of_week === prevDow);
    return w || null;
  }, [sleep, dow]);

  const wakeHourPrev = useMemo(() => {
    const wake = String(prevWindowForDay?.end_time || sleep?.goal?.target_wake_time || '07:00:00').slice(0, 5);
    const [wh, wm] = wake.split(':').map(Number);
    return (wh || 0) + (wm || 0) / 60;
  }, [prevWindowForDay, sleep?.goal?.target_wake_time]);

  const bedHourPrev = useMemo(() => {
    const bed = String(prevWindowForDay?.start_time || sleep?.goal?.target_bedtime || '23:00:00').slice(0, 5);
    const [bh, bm] = bed.split(':').map(Number);
    return (bh || 0) + (bm || 0) / 60;
  }, [prevWindowForDay, sleep?.goal?.target_bedtime]);

  const getEventStyle = (source?: string | null) => {
    if (source === 'task_planned') return 'bg-accent/15 border border-accent/30 text-foreground';
    if (source === 'task_due') return 'bg-accent/25 border border-accent/40 text-foreground';
    if (source === 'ics') return 'bg-cognitive-medium text-foreground';
    return 'bg-cognitive-low text-foreground';
  };

  const eventsForDay = useMemo((): DayViewEvent[] => {
    const day0 = parseApiTimestamp(`${dateStr} 00:00:00`, zone);
    if (!day0) return [];
    const day1 = day0.plus({ days: 1 });
    const startMs = day0.toMillis();
    const endMs = day1.toMillis();
    return events
      .map((e) => {
        const s = parseApiTimestampToDate(e.start_datetime, zone);
        const en = parseApiTimestampToDate(e.end_datetime, zone);
        if (!s || !en) return null;
        return { ...e, start: s, end: en };
      })
      .filter((e): e is DayViewEvent => Boolean(e && e.start.getTime() < endMs && e.end.getTime() > startMs))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [events, dateStr, zone]);

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
      const start = parseApiTimestampToDate(e.start_datetime, zone);
      const end = parseApiTimestampToDate(e.end_datetime, zone);
      if (!start || !end) return;
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
  }, [events, weekDays, zone]);

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
      const start = parseApiTimestampToDate(e.start_datetime, zone);
      const end = parseApiTimestampToDate(e.end_datetime, zone);
      if (!start || !end) return;
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
  }, [events, monthGrid.days, zone]);

  // Current time line: only for today, position based on hour (3am = 0)
  const [now, setNow] = useState(() => new Date());
  const todayStrInZone = DateTime.now().setZone(zone).toFormat('yyyy-MM-dd');
  const isViewingToday = dateStr === todayStrInZone;
  useEffect(() => {
    if (!isViewingToday) return;
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [isViewingToday]);
  const currentTimeTopPercent = useMemo(() => {
    if (!isViewingToday) return null;
    const hour = hourFloatInZone(now, zone);
    const hoursFrom3am = (hour - 3 + 24) % 24;
    return (hoursFrom3am / 24) * 100;
  }, [isViewingToday, now, zone]);

  const dayTimelineRef = useRef<HTMLDivElement | null>(null);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [dragPreviewStartMs, setDragPreviewStartMs] = useState<number | null>(null);
  /** Keeps the bar at the drop position until persist + reload finish (avoids one frame at old time). */
  const [postDropPlacement, setPostDropPlacement] = useState<{
    eventId: string;
    startMs: number;
    endMs: number;
  } | null>(null);
  const dragSessionRef = useRef<{
    pointerId: number;
    anchorY: number;
    startX: number;
    startY: number;
    moved: boolean;
    height: number;
    origStartMs: number;
    origEndMs: number;
    event: DayViewEvent;
  } | null>(null);

  const reloadCalendarEvents = useCallback(async () => {
    if (!token) return;
    const evRes = await apiJson<DbEvent[]>(
      `/api/me/calendar-events?from=${encodeURIComponent(`${fetchRange.from} 00:00:00`)}&to=${encodeURIComponent(`${fetchRange.to} 00:00:00`)}`,
      { token },
    );
    setEvents(evRes);
  }, [token, fetchRange.from, fetchRange.to]);

  const reloadSleepGoal = useCallback(async () => {
    if (!token) return;
    const goalRes = await apiJson<SleepGoalResponse>('/api/me/sleep-goal', { token });
    setSleep(goalRes);
  }, [token]);

  const reloadSleepAndEvents = useCallback(async () => {
    await Promise.all([reloadSleepGoal(), reloadCalendarEvents()]);
  }, [reloadSleepGoal, reloadCalendarEvents]);

  const persistEventTimeMove = useCallback(
    async (ev: DayViewEvent, newStart: Date, newEnd: Date) => {
      if (!token) return;
      const durMin = Math.max(1, Math.round((newEnd.getTime() - newStart.getTime()) / 60_000));
      if (ev.source === 'task_planned' && ev.task_id) {
        const task = await apiJson<Task>(`/api/me/tasks/${ev.task_id}`, { token });
        await apiJson(`/api/me/tasks/${ev.task_id}`, {
          method: 'PUT',
          token,
          body: JSON.stringify({
            ...task,
            planned_datetime: formatTimestampForApi(newStart, zone),
            estimated_minutes: durMin,
          }),
        });
      } else if (ev.source === 'task_due' && ev.task_id) {
        const task = await apiJson<Task>(`/api/me/tasks/${ev.task_id}`, { token });
        await apiJson(`/api/me/tasks/${ev.task_id}`, {
          method: 'PUT',
          token,
          body: JSON.stringify({
            ...task,
            due_datetime: formatTimestampForApi(newStart, zone),
          }),
        });
      } else {
        await apiJson(`/api/me/calendar-events/${encodeURIComponent(ev.event_id)}`, {
          method: 'PUT',
          token,
          body: JSON.stringify({
            start_datetime: formatTimestampForApi(newStart, zone),
            end_datetime: formatTimestampForApi(newEnd, zone),
          }),
        });
      }
      await reloadCalendarEvents();
    },
    [token, zone, reloadCalendarEvents],
  );

  const openEventEditor = useCallback(
    async (event: DayViewEvent) => {
      if (!token) return;
      if ((event.source === 'task_planned' || event.source === 'task_due') && event.task_id) {
        const task = await apiJson<Task>(`/api/me/tasks/${event.task_id}`, { token });
        setEditingTask(task);
        return;
      }
      setEditingEvent(event);
      setEditingEventScope('single');
      setEditingEventTitle(event.title || '');
      setEditingEventDescription(event.description || '');
      const s = parseApiTimestamp(event.start_datetime, zone);
      const en = parseApiTimestamp(event.end_datetime, zone);
      if (s?.isValid) {
        setEditingStartDate(s.toFormat('yyyy-MM-dd'));
        setEditingStartTime(s.toFormat('HH:mm'));
      } else {
        setEditingStartDate('');
        setEditingStartTime('');
      }
      if (en?.isValid) {
        setEditingEndDate(en.toFormat('yyyy-MM-dd'));
        setEditingEndTime(en.toFormat('HH:mm'));
      } else {
        setEditingEndDate('');
        setEditingEndTime('');
      }
      setEditingEventAllDay(Boolean(event.is_all_day));
    },
    [token, zone],
  );

  const snappedStartMillisFromClientY = useCallback(
    (clientY: number): number | null => {
      const rect = dayTimelineRef.current?.getBoundingClientRect();
      if (!rect || rect.height < 1) return null;
      const y = clientY - rect.top;
      const frac = Math.max(0, Math.min(1, y / rect.height));
      const strip0 = parseApiTimestamp(`${dateStr} 03:00:00`, zone);
      if (!strip0) return null;
      const snappedMin = snapMinutesToQuarter(Math.round(frac * 24 * 60));
      return strip0.plus({ minutes: snappedMin }).toMillis();
    },
    [dateStr, zone],
  );

  const DRAG_THRESHOLD_PX = 6;

  const onDragPointerDown = useCallback(
    (e: ReactPointerEvent, ev: DayViewEvent) => {
      if (ev.is_all_day) return;
      e.stopPropagation();
      e.preventDefault();
      const timeline = dayTimelineRef.current;
      if (!timeline) return;
      dragSessionRef.current = {
        pointerId: e.pointerId,
        anchorY: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        height: Math.max(timeline.getBoundingClientRect().height, 1),
        origStartMs: ev.start.getTime(),
        origEndMs: ev.end.getTime(),
        event: ev,
      };
      setDragPreviewStartMs(ev.start.getTime());
      setDraggingEventId(ev.event_id);
    },
    [],
  );

  useEffect(() => {
    if (!draggingEventId) return;
    const sess = dragSessionRef.current;
    if (!sess) return;
    const pid = sess.pointerId;

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      const s = dragSessionRef.current;
      if (!s) return;
      if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) > DRAG_THRESHOLD_PX) {
        s.moved = true;
      }
      if (!s.moved) return;
      const ms = snappedStartMillisFromClientY(e.clientY);
      if (ms != null) setDragPreviewStartMs(ms);
    };

    const finish = async (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);

      const ms = snappedStartMillisFromClientY(e.clientY);
      const ev = sess.event;
      const didMove = sess.moved;
      dragSessionRef.current = null;
      setDraggingEventId(null);
      setDragPreviewStartMs(null);

      if (!didMove) {
        void openEventEditor(ev);
        return;
      }

      if (ms == null) return;
      const dur = sess.origEndMs - sess.origStartMs;
      const newStart = new Date(ms);
      const newEnd = new Date(ms + dur);
      setPostDropPlacement({ eventId: ev.event_id, startMs: ms, endMs: ms + dur });
      try {
        await persistEventTimeMove(ev, newStart, newEnd);
      } finally {
        setPostDropPlacement(null);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [draggingEventId, snappedStartMillisFromClientY, persistEventTimeMove, openEventEditor]);

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Calendar" compact />

      <div className="px-5 pb-6">
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
                    {isViewingToday ? <span className="text-xs font-semibold text-red-500">Today</span> : null}
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

              // Apply the suggested sleep window so the protected purple zones move.
              await apiJson('/api/me/sleep-window/apply-suggestion', {
                method: 'POST',
                token,
                body: JSON.stringify({ date: dateStr }),
              });

              await reloadSleepAndEvents();
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
                    All times are saved in your profile timezone: <span className="font-medium text-foreground">{zone}</span>.
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

                  <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Event date</label>
                      <Input
                        type="date"
                        value={createEventDate}
                        onChange={(e) => {
                          const d = e.target.value;
                          setCreateEventDate(d);
                          const { endDate, endTime } = defaultEndOneHourAfterStart(d, createStartTime, zone);
                          setCreateEndDate(endDate);
                          setCreateEndTime(endTime);
                        }}
                        className="h-10 max-w-[220px]"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Defaults to the day you are viewing; change it to schedule on another day.
                      </p>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={createAllDay}
                        onChange={(e) => setCreateAllDay(e.target.checked)}
                        className="accent-accent"
                      />
                      All day (no specific start/end time)
                    </label>

                    {!createAllDay ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">Starts at</label>
                          <Input
                            type="time"
                            step={900}
                            value={createStartTime}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCreateStartTime(v);
                              const { endDate, endTime } = defaultEndOneHourAfterStart(createEventDate, v, zone);
                              setCreateEndDate(endDate);
                              setCreateEndTime(endTime);
                            }}
                            className="h-10"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">Ends at</label>
                          {createEndDate !== createEventDate ? (
                            <Input
                              type="date"
                              value={createEndDate}
                              onChange={(e) => setCreateEndDate(e.target.value)}
                              className="h-10 mb-1"
                            />
                          ) : null}
                          <Input
                            type="time"
                            step={900}
                            value={createEndTime}
                            onChange={(e) => setCreateEndTime(e.target.value)}
                            className="h-10"
                          />
                        </div>
                      </div>
                    ) : null}

                    {!createAllDay && createEventDate ? (
                      <p className="text-xs text-foreground rounded-md bg-background/80 border border-border/40 px-2 py-1.5">
                        <span className="font-medium">Preview:</span>{' '}
                        {(() => {
                          const a = combineDateAndTimeForApi(createEventDate, createStartTime, zone);
                          const b = combineDateAndTimeForApi(createEndDate, createEndTime, zone);
                          const da = parseApiTimestamp(a, zone);
                          const db = parseApiTimestamp(b, zone);
                          if (!da?.isValid || !db?.isValid) return 'Enter a valid date and times.';
                          const sameDay = da.toFormat('yyyy-MM-dd') === db.toFormat('yyyy-MM-dd');
                          return `${da.toFormat('EEE MMM d, h:mm a')} → ${sameDay ? db.toFormat('h:mm a') : db.toFormat('EEE MMM d, h:mm a')}`;
                        })()}
                      </p>
                    ) : createAllDay && createEventDate ? (
                      <p className="text-xs text-foreground rounded-md bg-background/80 border border-border/40 px-2 py-1.5">
                        <span className="font-medium">Preview:</span> All day on{' '}
                        {parseApiTimestamp(`${createEventDate} 12:00:00`, zone)?.toFormat('EEE MMM d, yyyy') ??
                          createEventDate}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1 sm:col-span-1">
                      <label className="text-[10px] text-muted-foreground">Repeat</label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                        value={createRepeat}
                        onChange={(e) => setCreateRepeat(e.target.value as typeof createRepeat)}
                      >
                        <option value="none">Does not repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekdays">Weekdays</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Occurrences</label>
                      <Input
                        type="number"
                        min="1"
                        max="365"
                        value={createRepeatCount}
                        onChange={(e) => setCreateRepeatCount(parseInt(e.target.value, 10) || 1)}
                        onWheel={blurNumberInputOnWheel}
                        disabled={createRepeat === 'none' || Boolean(createRepeatUntil)}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Repeat until</label>
                      <Input
                        type="date"
                        value={createRepeatUntil}
                        onChange={(e) => setCreateRepeatUntil(e.target.value)}
                        disabled={createRepeat === 'none'}
                        className="h-9"
                      />
                    </div>
                  </div>
                  {createError && <p className="text-xs text-destructive">{createError}</p>}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!token) return;
                      setCreating(true);
                      setCreateError(null);
                      const title = createTitle.trim();
                      const start = createAllDay
                        ? `${createEventDate} 00:00:00`
                        : combineDateAndTimeForApi(createEventDate, createStartTime, zone);
                      const end = createAllDay ? `${createEventDate} 23:59:59` : combineDateAndTimeForApi(createEndDate, createEndTime, zone);
                      const payload = {
                        title: title.length ? title : null,
                        description: createDescription.trim().length ? createDescription.trim() : null,
                        start_datetime: start,
                        end_datetime: end,
                        is_all_day: createAllDay,
                        source: 'manual',
                        status: 'scheduled',
                        repeat: createRepeat,
                        repeat_count: createRepeatCount,
                        repeat_until: createRepeatUntil || null,
                      };

                      try {
                        const created = await apiJson<DbEvent | { events: DbEvent[] }>('/api/me/calendar-events', {
                          method: 'POST',
                          token,
                          body: JSON.stringify(payload),
                        });
                        if ('events' in created && Array.isArray(created.events)) {
                          setEvents((prev) => [...prev, ...created.events]);
                        } else {
                          setEvents((prev) => [...prev, created]);
                        }
                        setCreateOpen(false);
                        setCreateTitle('');
                        setCreateDescription('');
                        setCreateStartTime('09:00');
                        setCreateEndDate(dateStr);
                        setCreateEndTime('10:00');
                        setCreateAllDay(false);
                        setCreateRepeat('none');
                        setCreateRepeatCount(5);
                        setCreateRepeatUntil('');
                      } catch (err) {
                        if (err instanceof ApiError && err.status === 409 && err.details && typeof err.details === 'object') {
                          const details = err.details as { code?: string } | null;
                          const code = details?.code ? String(details.code) : null;
                          setSleepWindowConflict({
                            open: true,
                            title,
                            start_datetime: start,
                            end_datetime: end,
                            event_date: createEventDate,
                            repeat: createRepeat,
                            repeat_count: createRepeatCount,
                            repeat_until: createRepeatUntil || null,
                            is_all_day: createAllDay,
                            conflictCode: code,
                            message: err.message,
                            description: createDescription,
                          });
                          setSleepWindowConflictError(null);
                          return;
                        }
                        setCreateError(err instanceof Error ? err.message : 'Failed to create event');
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

        {/* Sleep-window conflict resolution dialog (after submit) */}
        <Dialog
          open={Boolean(sleepWindowConflict?.open)}
          onOpenChange={(open) => {
            if (!open) {
              setSleepWindowConflict(null);
              setSleepWindowConflictError(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Event falls in your sleep window</DialogTitle>
              <DialogDescription>
                {sleepWindowConflict?.message || 'This event overlaps your sleep window.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{sleepWindowConflict?.title || 'Event'}</span>
                {sleepWindowConflict ? (
                  <>
                    {' '}
                    • {fmtPgLocal(sleepWindowConflict.start_datetime, zone)} – {fmtPgLocal(sleepWindowConflict.end_datetime, zone)}
                  </>
                ) : null}
              </p>
              {sleepWindowConflictError ? (
                <p className="text-sm text-destructive">{sleepWindowConflictError}</p>
              ) : null}
            </div>

            <DialogFooter className="flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  if (!token || !sleepWindowConflict) return;
                  setSleepWindowConflictError(null);
                  const payload = {
                    title: sleepWindowConflict.title.trim().length ? sleepWindowConflict.title.trim() : null,
                    description: sleepWindowConflict.description.trim().length ? sleepWindowConflict.description.trim() : null,
                    start_datetime: sleepWindowConflict.start_datetime,
                    end_datetime: sleepWindowConflict.end_datetime,
                    is_all_day: sleepWindowConflict.is_all_day,
                    source: 'manual',
                    status: 'scheduled',
                    repeat: sleepWindowConflict.repeat,
                    repeat_count: sleepWindowConflict.repeat_count,
                    repeat_until: sleepWindowConflict.repeat_until,
                    ignore_sleep_validation: true,
                  };

                  await apiJson('/api/me/calendar-events', {
                    method: 'POST',
                    token,
                    body: JSON.stringify(payload),
                  });

                  await reloadCalendarEvents();

                  setSleepWindowConflict(null);
                  setCreateOpen(false);
                  setCreateTitle('');
                  setCreateDescription('');
                  setCreateStartTime('09:00');
                  setCreateEndDate(dateStr);
                  setCreateEndTime('10:00');
                  setCreateAllDay(false);
                  setCreateRepeat('none');
                  setCreateRepeatCount(5);
                  setCreateRepeatUntil('');
                }}
              >
                Keep in this time
              </Button>

              <Button
                type="button"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setSleepWindowConflict(null);
                  setSleepWindowConflictError(null);
                  setCreateOpen(false);
                }}
              >
                Delete
              </Button>

              <Button
                type="button"
                onClick={async () => {
                  if (!token || !sleepWindowConflict) return;
                  setSleepWindowConflictError(null);
                  try {
                    await apiJson('/api/me/sleep-window/apply-suggestion', {
                      method: 'POST',
                      token,
                      body: JSON.stringify({
                        date: sleepWindowConflict.event_date,
                        proposed_event: {
                          start_datetime: sleepWindowConflict.start_datetime,
                          end_datetime: sleepWindowConflict.end_datetime,
                        },
                      }),
                    });

                    // Clear preview suggestions so the UI uses the updated saved sleep window.
                    setSuggestions(null);
                    await reloadSleepAndEvents();

                    await apiJson('/api/me/calendar-events', {
                      method: 'POST',
                      token,
                      body: JSON.stringify({
                        title: sleepWindowConflict.title.trim().length ? sleepWindowConflict.title.trim() : null,
                        description: sleepWindowConflict.description.trim().length ? sleepWindowConflict.description.trim() : null,
                        start_datetime: sleepWindowConflict.start_datetime,
                        end_datetime: sleepWindowConflict.end_datetime,
                        is_all_day: sleepWindowConflict.is_all_day,
                        source: 'manual',
                        status: 'scheduled',
                        repeat: sleepWindowConflict.repeat,
                        repeat_count: sleepWindowConflict.repeat_count,
                        repeat_until: sleepWindowConflict.repeat_until,
                      }),
                    });

                    await reloadCalendarEvents();
                    setSleepWindowConflict(null);
                    setCreateOpen(false);
                  } catch (err) {
                    setSleepWindowConflictError(err instanceof Error ? err.message : 'Failed to suggest shift');
                  }
                }}
              >
                Suggest shift
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Suggested sleep window (day view only) */}
        {viewMode === 'day' && suggestions?.sleep_window?.start && suggestions?.sleep_window?.end ? (
          <div className="mb-4 bg-card border border-border/50 rounded-xl p-3">
            <p className="text-xs text-foreground font-medium mb-1">Suggested sleep window</p>
            <p className="text-xs text-muted-foreground">
              {fmtPgLocal(suggestions.sleep_window.start, zone)} – {fmtPgLocal(suggestions.sleep_window.end, zone)}
              {suggestions?.moved_sleep_window ? (
                <span className="text-muted-foreground"> (adjusted to fit your schedule)</span>
              ) : null}
            </p>
            {suggestions?.warning ? (
              <p className="text-xs text-muted-foreground mt-1">{String(suggestions.warning)}</p>
            ) : null}
          </div>
        ) : null}

        {/* Day view — timeline with 3am anchor; events positioned by wall time in profile zone */}
        <div className={viewMode === 'day' ? 'block' : 'hidden'}>
          <p className="text-[11px] text-muted-foreground mb-2 px-1">
            Times use your profile timezone ({zone}). Drag an event to reschedule; tap without dragging to edit.
          </p>
          <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden">
            <div className="flex">
              <div className="w-[7.5rem] flex-shrink-0 border-r border-border/30 flex flex-col bg-card">
                {hours.map(({ hour, label }) => (
                  <div
                    key={hour}
                    className="min-h-[3rem] border-b border-border/30 py-2 px-2 text-[11px] text-muted-foreground"
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div ref={dayTimelineRef} className="flex-1 relative min-h-[72rem] bg-background/30">
                {hours.map(({ hour }) => {
                  const currentCrossesMidnight = sleepTimes.bedHour >= sleepTimes.wakeHour;

                  // Only apply the "previous day episode" adjustment to saved sleep windows.
                  // When using suggested sleep windows, the timestamps already include the correct episode boundaries.
                  const isSavedMode = sleepTimes.source === 'saved';
                  const prevCrossesMidnight = isSavedMode ? bedHourPrev >= wakeHourPrev : false;
                  const inPrevEpisode = isSavedMode ? prevCrossesMidnight && hour < Math.floor(wakeHourPrev) : false;

                  const inSleepWindow = isSavedMode
                    ? currentCrossesMidnight
                      ? hour >= Math.floor(sleepTimes.bedHour) || inPrevEpisode
                      : (hour >= Math.floor(sleepTimes.bedHour) && hour < Math.floor(sleepTimes.wakeHour)) || inPrevEpisode
                    : currentCrossesMidnight
                      ? hour >= Math.floor(sleepTimes.bedHour) || hour < Math.floor(sleepTimes.wakeHour)
                      : hour >= Math.floor(sleepTimes.bedHour) && hour < Math.floor(sleepTimes.wakeHour);

                  const wakeBoundaryHour = isSavedMode && prevCrossesMidnight ? wakeHourPrev : sleepTimes.wakeHour;
                  const inWakeWindow = hour >= Math.floor(wakeBoundaryHour) && hour < Math.floor(wakeBoundaryHour) + 1;
                  const isWakeRow = hour === Math.floor(wakeBoundaryHour);
                  const isBedRow = hour === Math.floor(sleepTimes.bedHour);
                  return (
                    <div
                      key={hour}
                      className={`relative min-h-[3rem] border-b border-border/30 ${
                        inSleepWindow ? 'sleep-window-bg' : inWakeWindow ? 'wake-window-bg' : ''
                      }`}
                    >
                      {isWakeRow && (
                        <>
                          <div className="absolute top-0 left-0 right-0 h-px bg-warning/60 z-[5]" />
                          <div className="absolute left-2 top-1/2 -translate-y-1/2 z-[5] pointer-events-none">
                            <Sun className="w-4 h-4 text-warning" />
                          </div>
                        </>
                      )}
                      {isBedRow && (
                        <>
                          <div className="absolute top-0 left-0 right-0 h-px bg-sleep/60 z-[5]" />
                          <div className="absolute left-2 top-1/2 -translate-y-1/2 z-[5] pointer-events-none">
                            <Moon className="w-4 h-4 text-sleep" />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                {isViewingToday && currentTimeTopPercent != null && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none flex items-center gap-2"
                    style={{ top: `${currentTimeTopPercent}%` }}
                  >
                    <div className="w-2 h-2 rounded-full bg-destructive flex-shrink-0" />
                    <div className="flex-1 h-px bg-destructive/80" />
                    <span className="text-[10px] font-medium text-destructive pr-2">
                      {DateTime.fromJSDate(now).setZone(zone).toFormat('h:mm a')}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 z-30 px-1 pointer-events-none">
                  {eventsForDay.map((event) => {
                    let sTime = event.start.getTime();
                    let eTime = event.end.getTime();
                    if (postDropPlacement?.eventId === event.event_id) {
                      sTime = postDropPlacement.startMs;
                      eTime = postDropPlacement.endMs;
                    } else if (draggingEventId === event.event_id && dragPreviewStartMs != null) {
                      const d = eTime - sTime;
                      sTime = dragPreviewStartMs;
                      eTime = dragPreviewStartMs + d;
                    }
                    const s = new Date(sTime);
                    const en = new Date(eTime);
                    const startH = hourFloatInZone(s, zone);
                    const durH = Math.max(0.25, (en.getTime() - s.getTime()) / 3_600_000);
                    const top = percentFromHourFloatFrom3am(startH);
                    const hPct = (durH / 24) * 100;
                    const draggable = !event.is_all_day;
                    const startLabel = DateTime.fromJSDate(s).setZone(zone).toFormat('h:mm a');
                    const endLabel = DateTime.fromJSDate(en).setZone(zone).toFormat('h:mm a');
                    return (
                      <div
                        key={event.event_id}
                        className={`absolute left-1 right-1 rounded-lg overflow-hidden border border-border/40 shadow-sm pointer-events-auto select-none ${
                          draggable
                            ? 'cursor-grab active:cursor-grabbing touch-none'
                            : 'cursor-pointer'
                        }`}
                        style={{
                          top: `${top}%`,
                          height: `${hPct}%`,
                          minHeight: '1.75rem',
                        }}
                        onPointerDown={draggable ? (e) => onDragPointerDown(e, event) : undefined}
                        onClick={!draggable ? () => void openEventEditor(event) : undefined}
                        role={!draggable ? 'button' : undefined}
                        tabIndex={!draggable ? 0 : undefined}
                        onKeyDown={
                          !draggable
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  void openEventEditor(event);
                                }
                              }
                            : undefined
                        }
                      >
                        <div className={`h-full text-left px-2 py-1.5 text-xs font-medium min-w-0 ${getEventStyle(event.source)}`}>
                          <div className="flex items-center gap-1.5 min-w-0">
                            {event.source === 'task_planned' ? (
                              <CheckSquare className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                            ) : event.source === 'task_due' ? (
                              <Clock3 className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                            ) : null}
                            {calendarTaskPastDue(event) && <LatePill />}
                            {taskPriorityIndicator(event, false)}
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-sm border flex-shrink-0 ${
                                event.source === 'task_planned'
                                  ? 'border-accent/40 text-accent bg-accent/10'
                                  : event.source === 'task_due'
                                    ? 'border-accent/60 text-accent bg-accent/20'
                                    : 'border-border/40 text-muted-foreground bg-background/40'
                              }`}
                            >
                              {event.source === 'task_planned'
                                ? 'PLANNED'
                                : event.source === 'task_due'
                                  ? 'DUE'
                                  : 'EVENT'}
                            </span>
                            <span className="truncate font-medium">{event.title || 'Event'}</span>
                          </div>
                          <div className="text-[10px] opacity-85 mt-0.5">
                            {startLabel} – {endLabel}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
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
                  const prevDow = (dow + 6) % 7;
                  const prevSt = sleepTimesByDow[prevDow];
                  const bedHour = st?.bedHour ?? 23;
                  const wakeHour = st?.wakeHour ?? 7;
                  const prevBedHour = prevSt?.bedHour ?? bedHour;
                  const prevWakeHour = prevSt?.wakeHour ?? wakeHour;
                  const currentCrossesMidnight = bedHour >= wakeHour;
                  const prevCrossesMidnight = prevBedHour >= prevWakeHour;

                  const inSleepWindow = currentCrossesMidnight
                    ? hour >= Math.floor(bedHour) || (prevCrossesMidnight && hour < Math.floor(prevWakeHour))
                    : (hour >= Math.floor(bedHour) && hour < Math.floor(wakeHour)) || (prevCrossesMidnight && hour < Math.floor(prevWakeHour));

                  const wakeBoundaryHour = prevCrossesMidnight ? prevWakeHour : wakeHour;
                  const inWakeWindow = hour >= Math.floor(wakeBoundaryHour) && hour < Math.floor(wakeBoundaryHour) + 1;
                  const hourStart = hour;
                  const hourEnd = hour + 1;
                  const dayEvents = (eventsForWeekDay[dayKey] || []).filter((x) => {
                    const startH = hourFloatInZone(x.start, zone);
                    const endH = hourFloatInZone(x.end, zone);
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
                          onClick={() => void openEventEditor({ ...event, start, end })}
                          className={`w-full text-left rounded px-1.5 py-0.5 text-[10px] truncate flex items-center gap-0.5 ${getEventStyle(event.source)}`}
                        >
                          {calendarTaskPastDue(event) && <LatePill compact />}
                          {taskPriorityIndicator(event, true)}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          void openEventEditor({ ...event, start, end });
                        }}
                        className={`w-full text-left rounded px-1 py-0.5 text-[10px] truncate flex items-center gap-0.5 ${getEventStyle(event.source)}`}
                      >
                        {calendarTaskPastDue(event) && <LatePill compact />}
                        {taskPriorityIndicator(event, true)}
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
                        ? `→ ${fmtPgLocal(c.suggested_start_datetime, zone)}–${fmtPgLocal(c.suggested_end_datetime, zone)}`
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

                        await reloadCalendarEvents();
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
            await apiJson<Task | { tasks: Task[] }>(
              `/api/me/tasks/${updated.task_id}?scope=${encodeURIComponent(updated.edit_scope || 'single')}`,
              {
                method: 'PUT',
                token,
                body: JSON.stringify({
                  title: updated.title,
                  notes: updated.notes,
                  priority: updated.priority,
                  status: updated.status,
                  planned_datetime: updated.planned_datetime,
                  estimated_minutes: updated.estimated_minutes,
                  due_datetime: updated.due_datetime,
                  category: updated.category || null,
                }),
              },
            );
            // Refresh events so calendar reflects changes (use full fetch range for recurring tasks)
            const evRes = await apiJson<DbEvent[]>(
              `/api/me/calendar-events?from=${encodeURIComponent(`${fetchRange.from} 00:00:00`)}&to=${encodeURIComponent(`${fetchRange.to} 00:00:00`)}`,
              { token },
            );
            setEvents(evRes);
          }}
          onDelete={async (task) => {
            if (!token || !task.task_id) throw new Error('Task not found');
            await apiJson(`/api/me/tasks/${task.task_id}?scope=${encodeURIComponent(task.edit_scope || 'single')}`, {
              method: 'DELETE',
              token,
            });
            await reloadCalendarEvents();
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
            setEditingEventError(null);
            setEditingStartDate('');
            setEditingStartTime('');
            setEditingEndDate('');
            setEditingEndTime('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit event</DialogTitle>
            <DialogDescription>
              Times use your profile timezone: <span className="font-medium text-foreground">{zone}</span>.
            </DialogDescription>
          </DialogHeader>
          {editingEventError ? (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <p className="text-sm text-destructive">{editingEventError}</p>
            </div>
          ) : null}
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
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                className="accent-accent"
                checked={editingEventAllDay}
                onChange={(e) => setEditingEventAllDay(e.target.checked)}
              />
              All day
            </label>

            {!editingEventAllDay ? (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-3">
                <p className="text-[11px] font-medium text-foreground">Start</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Date</label>
                    <Input
                      type="date"
                      value={editingStartDate}
                      onChange={(e) => {
                        const d = e.target.value;
                        setEditingStartDate(d);
                        const { endDate, endTime } = defaultEndOneHourAfterStart(d, editingStartTime, zone);
                        setEditingEndDate(endDate);
                        setEditingEndTime(endTime);
                      }}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Time</label>
                    <Input
                      type="time"
                      step={900}
                      value={editingStartTime}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditingStartTime(v);
                        const { endDate, endTime } = defaultEndOneHourAfterStart(editingStartDate, v, zone);
                        setEditingEndDate(endDate);
                        setEditingEndTime(endTime);
                      }}
                      className="h-10"
                    />
                  </div>
                </div>
                <p className="text-[11px] font-medium text-foreground">End</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Date</label>
                    <Input
                      type="date"
                      value={editingEndDate}
                      onChange={(e) => setEditingEndDate(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Time</label>
                    <Input
                      type="time"
                      step={900}
                      value={editingEndTime}
                      onChange={(e) => setEditingEndTime(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Date (all day)</label>
                <Input
                  type="date"
                  value={editingStartDate}
                  onChange={(e) => {
                    setEditingStartDate(e.target.value);
                    setEditingEndDate(e.target.value);
                  }}
                  className="h-10 max-w-[220px]"
                />
              </div>
            )}
            {editingEvent?.recurrence_series_id ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Apply changes to</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={editingEventScope}
                  onChange={(e) => setEditingEventScope(e.target.value as 'single' | 'series')}
                >
                  <option value="single">Only this event</option>
                  <option value="series">All events in this series</option>
                </select>
              </div>
            ) : null}
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
                  setEditingEventError(null);
                  const deleted = await apiJson<{ deleted_event_ids?: string[] }>(`/api/me/calendar-events/${editingEvent.event_id}?scope=${encodeURIComponent(editingEventScope)}`, {
                    method: 'DELETE',
                    token,
                  });
                  // Reload to guarantee UI stays in sync even if recurrence scope
                  // or ID mapping differs across day/week/month views.
                  await reloadCalendarEvents();
                  setEditingEvent(null);
                } catch (err) {
                  setEditingEventError(err instanceof Error ? err.message : 'Failed to delete event');
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
                    setEditingEventError(null);
                    const allDayDate =
                      (editingStartDate && editingStartDate.length >= 10 ? editingStartDate : null) ||
                      parseApiTimestamp(editingEvent.start_datetime, zone)?.toFormat('yyyy-MM-dd') ||
                      dateStr;
                    const startSql = editingEventAllDay
                      ? `${allDayDate} 00:00:00`
                      : combineDateAndTimeForApi(editingStartDate, editingStartTime, zone);
                    const endSql = editingEventAllDay
                      ? `${allDayDate} 23:59:59`
                      : combineDateAndTimeForApi(editingEndDate, editingEndTime, zone);
                    await apiJson<DbEvent | { events: DbEvent[] }>(
                      `/api/me/calendar-events/${editingEvent.event_id}?scope=${encodeURIComponent(editingEventScope)}`,
                      {
                        method: 'PUT',
                        token,
                        body: JSON.stringify({
                          title: editingEventTitle || null,
                          description: editingEventDescription || null,
                          start_datetime: startSql || null,
                          end_datetime: endSql || null,
                          is_all_day: editingEventAllDay,
                        }),
                      },
                    );
                    await reloadCalendarEvents();
                    setEditingEvent(null);
                  } catch (err) {
                    setEditingEventError(err instanceof Error ? err.message : 'Failed to save event');
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
