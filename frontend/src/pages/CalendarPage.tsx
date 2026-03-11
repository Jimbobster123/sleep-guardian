import PageHeader from '@/components/PageHeader';
import { Sun, Moon, ChevronLeft, ChevronRight, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { format, addDays, subDays } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { apiJson } from '@/lib/api';

const hours = Array.from({ length: 19 }, (_, i) => {
  const h = i + 6;
  const ampm = h >= 12 ? 'pm' : 'am';
  const display = h > 12 ? h - 12 : h;
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
    const bed = String(windowForDay?.start_time || sleep?.goal?.target_bedtime || '23:00:00').slice(0, 5);
    const wake = String(windowForDay?.end_time || sleep?.goal?.target_wake_time || '07:00:00').slice(0, 5);
    const [bh, bm] = bed.split(':').map(Number);
    const [wh, wm] = wake.split(':').map(Number);
    return {
      bedHour: (bh || 0) + (bm || 0) / 60,
      wakeHour: (wh || 0) + (wm || 0) / 60,
      label: `${bed} – ${wake}`,
    };
  }, [windowForDay, sleep]);

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
          <p className="text-xs text-muted-foreground">Sleep window: <span className="text-foreground/80">{sleepTimes.label}</span></p>
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
                <div key={c.event_id} className="text-xs text-foreground/90">
                  <span className="font-medium">{c.title || 'Event'}</span>{" "}
                  <span className="text-muted-foreground">
                    {c.suggested_start_datetime ? `→ ${c.suggested_start_datetime}–${c.suggested_end_datetime}` : "(no shift found)"}
                  </span>
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
