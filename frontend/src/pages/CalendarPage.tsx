import PageHeader from '@/components/PageHeader';
import { Sun, Moon, ChevronLeft, ChevronRight, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { format, addDays, subDays } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { apiJson } from '@/lib/api';

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
  title: string | null;
  description: string | null;
  start_datetime: string;
  end_datetime: string;
  source: string | null;
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
  const [sleep, setSleep] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const dateStr = useMemo(() => format(day, 'yyyy-MM-dd'), [day]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      setLoading(true);
      try {
        const [goalRes, evRes] = await Promise.all([
          apiJson('/api/me/sleep-goal', { token }),
          apiJson<DbEvent[]>(`/api/me/calendar-events?from=${encodeURIComponent(`${dateStr} 00:00:00`)}&to=${encodeURIComponent(`${format(addDays(day, 2), 'yyyy-MM-dd')} 00:00:00`)}`, { token }),
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
    const w = (sleep?.windows || []).find((x: any) => x.day_of_week === dow);
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
                      <div key={event.event_id} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${getEventStyle(event.source)} mb-1`}>
                        <div className="flex items-center gap-1.5">
                          {inWakeWindow && <Sun className="w-3.5 h-3.5" />}
                          {inSleepWindow && <Moon className="w-3.5 h-3.5" />}
                          <span className="truncate">{event.title || 'Event'}</span>
                          <span className="text-[10px] opacity-70 ml-auto">
                            {format(event.start, 'h:mm a')}–{format(event.end, 'h:mm a')}
                          </span>
                        </div>
                      </div>
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

                        // Refresh events for the current range
                        const evRes = await apiJson<DbEvent[]>(
                          `/api/me/calendar-events?from=${encodeURIComponent(`${dateStr} 00:00:00`)}&to=${encodeURIComponent(`${format(addDays(day, 2), 'yyyy-MM-dd')} 00:00:00`)}`,
                          { token }
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
    </div>
  );
};

export default CalendarPage;
