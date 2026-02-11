import PageHeader from '@/components/PageHeader';
import { Sun, Moon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

const hours = Array.from({ length: 19 }, (_, i) => {
  const h = i + 6;
  const ampm = h >= 12 ? 'pm' : 'am';
  const display = h > 12 ? h - 12 : h;
  return { hour: h, label: `${display}:00 ${ampm}` };
});

interface CalEvent {
  name: string;
  startHour: number;
  endHour: number;
  type: 'low' | 'medium' | 'high' | 'sleep' | 'wake';
}

const events: CalEvent[] = [
  { name: 'Wake Window', startHour: 7, endHour: 8, type: 'wake' },
  { name: 'Work', startHour: 9, endHour: 11, type: 'low' },
  { name: 'IS 455', startHour: 12, endHour: 13, type: 'high' },
  { name: 'IS 414', startHour: 14, endHour: 15.5, type: 'high' },
  { name: 'Date Night', startHour: 19, endHour: 20.5, type: 'medium' },
  { name: 'Sleep Window', startHour: 23, endHour: 24, type: 'sleep' },
];

const CalendarPage = () => {
  const { crisisMode } = useApp();

  const getEventStyle = (type: CalEvent['type']) => {
    switch (type) {
      case 'wake': return 'border-l-4 border-wake bg-wake/10 text-wake-foreground';
      case 'sleep': return 'border-l-4 border-sleep bg-sleep-light text-foreground';
      case 'low': return 'bg-cognitive-low text-foreground';
      case 'medium': return 'bg-cognitive-medium text-foreground';
      case 'high': return 'bg-cognitive-high text-foreground';
    }
  };

  return (
    <div>
      <PageHeader title="Calendar" compact />

      <div className="px-5 -mt-2 pb-6">
        {/* Date picker */}
        <div className="bg-card rounded-xl p-3 shadow-sm border border-border/50 mb-4 flex items-center justify-between">
          <button className="p-1"><ChevronLeft className="w-4 h-4 text-muted-foreground" /></button>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-foreground">Feb</span>
            <span className="text-muted-foreground">5</span>
            <span className="text-muted-foreground">2026</span>
          </div>
          <button className="p-1"><ChevronRight className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        {/* Day view */}
        <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden">
          <div className="relative">
            {hours.map(({ hour, label }) => {
              const event = events.find(e => e.startHour === hour);
              const inSleepWindow = hour >= 23;
              const inWakeWindow = hour >= 7 && hour < 8;

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
                    {event && (
                      <div className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${getEventStyle(event.type)}`}>
                        <div className="flex items-center gap-1.5">
                          {event.type === 'wake' && <Sun className="w-3.5 h-3.5" />}
                          {event.type === 'sleep' && <Moon className="w-3.5 h-3.5" />}
                          {event.name}
                        </div>
                        {event.type === 'high' && (
                          <span className="text-[10px] opacity-70">High cognitive load</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sleep defense notice */}
        <div className="mt-4 bg-sleep-light border border-sleep/20 rounded-xl p-3">
          <p className="text-xs text-foreground">
            <Moon className="w-3.5 h-3.5 inline mr-1 text-sleep" />
            <span className="font-medium">Sleep window protected:</span> 11:00 PM – 7:00 AM.
            Scheduling here will trigger a gentle warning.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CalendarPage;
