import PageHeader from '@/components/PageHeader';
import { Sun, Moon, ChevronLeft, ChevronRight, Wand2, Plus, Calendar as CalendarIcon, CheckSquare, Clock3, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { format, addDays, subDays } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { apiJson } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
};

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

const CalendarPage = () => {
  const { token } = useAuth();
  const [day, setDay] = useState(() => new Date());
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      setLoading(true);
      try {
        const [goalRes, evRes] = await Promise.all([
          apiJson<SleepGoalResponse>('/api/me/sleep-goal', { token }),
          apiJson<DbEvent[]>(
            `/api/me/calendar-events?from=${encodeURIComponent(`${dateStr} 00:00:00`)}&to=${encodeURIComponent(`${format(addDays(day, 2), 'yyyy-MM-dd')} 00:00:00`)}`,
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
  }, [token, dateStr, day]);

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
        label: `${format(suggestedStart, 'HH:mm')} – ${format(suggestedEnd, 'HH:mm')}`,
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
      label: `${bed} – ${wake}`,
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

  return (
    <div>
      <PageHeader title="Calendar" compact />

      <div className="px-5 -mt-2 pb-6">
        {/* Date picker */}
        <div className="bg-card rounded-xl p-3 shadow-sm border border-border/50 mb-4 flex items-center justify-between">
          <button className="p-1" onClick={() => setDay((d) => subDays(d, 1))}>
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-foreground">{format(day, 'MMM')}</span>
            <span className="text-muted-foreground">{format(day, 'd')}</span>
            <span className="text-muted-foreground">{format(day, 'yyyy')}</span>
          </div>
          <button className="p-1" onClick={() => setDay((d) => addDays(d, 1))}>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground">Sleep window: <span className="text-foreground/80">{sleepTimes.label}</span></p>
          <div className="flex items-center gap-2">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 px-2.5 gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add event
                </Button>
              </DialogTrigger>
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
          <p className="text-xs text-muted-foreground">
            Sleep window:{' '}
            <span className="text-foreground/80">{sleepTimes.label}</span>
            {sleepTimes.source === 'suggested' ? <span className="text-muted-foreground"> (suggested)</span> : null}
          </p>
          <button
            onClick={async () => {
              if (!token) return;
              const res = await apiJson('/api/me/schedule/suggestions', {
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

        {/* Suggested sleep window (fixed_duration can move it) */}
        {suggestions?.sleep_window?.start && suggestions?.sleep_window?.end ? (
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
        <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden">
          <div className="relative">
            {hours.map(({ hour, label }) => {
              const eventStarts = eventsForDay.filter((e) => e.start.getHours() === hour);
              const inSleepWindow =
                sleepTimes.bedHour >= sleepTimes.wakeHour
                  ? hour >= Math.floor(sleepTimes.bedHour) || hour < Math.floor(sleepTimes.wakeHour)
                  : hour >= Math.floor(sleepTimes.bedHour) && hour < Math.floor(sleepTimes.wakeHour);
              const inWakeWindow = hour >= Math.floor(sleepTimes.wakeHour) && hour < Math.floor(sleepTimes.wakeHour) + 1;

              return (
                <div
                  key={hour}
                  className={`flex border-b border-border/30 min-h-[3rem] ${
                    inSleepWindow ? 'sleep-window-bg' : inWakeWindow ? 'wake-window-bg' : ''
                  }`}
                >
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
                    {!loading && !eventStarts.length && hour === 12 && !eventsForDay.length && (
                      <div className="text-xs text-muted-foreground px-2 py-1">No events for this day yet.</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sleep defense notice */}
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
        ) : (
          <div className="mt-4 bg-sleep-light border border-sleep/20 rounded-xl p-3">
            <p className="text-xs text-foreground">
              <Moon className="w-3.5 h-3.5 inline mr-1 text-sleep" />
              <span className="font-medium">Sleep window protected:</span> {sleepTimes.label}. Scheduling here will trigger a gentle warning.
            </p>
          </div>
        )}
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
