import PageHeader from '@/components/PageHeader';
import TaskItem from '@/components/TaskItem';
import EmotionalCheckIn from '@/components/EmotionalCheckIn';
import { useApp } from '@/contexts/AppContext';
import { Moon, Flame, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const { bedtime, streak, crisisMode } = useApp();
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader title="Home" />

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
          <TaskItem title="Security Lab" subtitle="IS 414" duration={90} />
          <TaskItem title="Data Preparation" subtitle="IS 455" duration={60} />
          <TaskItem title="Laundry" subtitle="Personal" duration={45} />
        </div>

        {/* Last Night Stats */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50 animate-fade-in-delay-2">
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

        {/* Calendar Preview */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50 animate-fade-in-delay-2">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-foreground">Calendar</h2>
            <button
              onClick={() => navigate('/calendar')}
              className="text-xs text-accent font-medium flex items-center gap-0.5"
            >
              View <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2">
            {[
              { day: 'WED 26', events: [{ name: 'Vocab Day', color: 'bg-wake', time: '' }, { name: 'Feed the cat', color: 'bg-accent/20', time: '1 PM' }] },
              { day: 'THU 27', events: [{ name: 'Feed the cat', color: 'bg-accent/20', time: '1 PM' }] },
              { day: 'FRI 28', events: [{ name: 'Designing', color: 'bg-wake', time: '' }, { name: 'Feed the cat', color: 'bg-accent/20', time: '1 PM' }] },
            ].map(({ day, events }) => (
              <div key={day} className="flex gap-3 items-start">
                <span className="text-[10px] text-muted-foreground font-medium w-12 pt-1 flex-shrink-0">{day}</span>
                <div className="flex-1 flex flex-col gap-1">
                  {events.map((e, i) => (
                    <div key={i} className={`${e.color} rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground`}>
                      {e.name} {e.time && <span className="text-muted-foreground ml-1">{e.time}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
