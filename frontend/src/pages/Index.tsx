import PageHeader from '@/components/PageHeader';
import TaskItem from '@/components/TaskItem';
import EmotionalCheckIn from '@/components/EmotionalCheckIn';
import { useApp } from '@/contexts/AppContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Moon, Flame, ChevronRight, Sun, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const { bedtime, streak, crisisMode, setCrisisMode } = useApp();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

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

        {/* Emotional Check-In */}
        <div className="animate-fade-in-delay">
          <EmotionalCheckIn />
        </div>

        {/* Crisis Mode Toggle */}
        <div
          className={`rounded-xl p-4 border shadow-sm ${
            crisisMode ? 'bg-crisis-light border-crisis/30 crisis-glow' : 'bg-card border-border/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  crisisMode ? 'bg-crisis/10' : 'bg-muted'
                }`}
              >
                <Zap className={`w-5 h-5 ${crisisMode ? 'text-crisis' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Crisis / Exam Mode</p>
                <p className="text-xs text-muted-foreground">
                  {crisisMode ? 'Active — strategic recovery focus' : 'For exams, deadlines, INTEX weeks'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setCrisisMode(!crisisMode)}
              className={`relative w-12 h-7 rounded-full transition-colors ${crisisMode ? 'bg-crisis' : 'bg-muted'}`}
            >
              <div
                className={`absolute top-1 w-5 h-5 rounded-full bg-card shadow transition-transform ${
                  crisisMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {crisisMode && (
            <div className="mt-3 text-xs text-foreground/80 space-y-1">
              <p>• Goal shifts to "mitigate damage"</p>
              <p>• Power nap & 90-min cycle suggestions enabled</p>
              <p>• Streak penalties relaxed</p>
            </div>
          )}
        </div>

        {/* Dark Mode Toggle */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                {theme === 'dark' ? (
                  <Sun className="w-5 h-5 text-warning" />
                ) : (
                  <Moon className="w-5 h-5 text-sleep" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Dark Mode</p>
                <p className="text-xs text-muted-foreground">{theme === 'dark' ? 'Night theme active' : 'Switch to night theme'}</p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative w-12 h-7 rounded-full transition-colors ${theme === 'dark' ? 'bg-accent' : 'bg-muted'}`}
            >
              <div
                className={`absolute top-1 w-5 h-5 rounded-full bg-card shadow transition-transform ${
                  theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Quick Adjustments */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <p className="text-sm font-semibold text-foreground mb-2">Quick Adjustments</p>
          <div className="flex gap-2 flex-wrap">
            {['Late night', 'Early morning', 'Traveling', 'Sick'].map((label) => (
              <button
                key={label}
                className="text-xs bg-muted text-foreground rounded-full px-3 py-1.5 hover:bg-accent/10 hover:text-accent transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">The app will adjust intelligently without breaking your streak.</p>
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

        {/* Calendar Preview — clickable */}
        <button
          onClick={() => navigate('/calendar')}
          className="w-full text-left bg-card rounded-xl p-4 shadow-sm border border-border/50 animate-fade-in-delay-2 hover:border-accent/30 transition-colors"
        >
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-foreground">Calendar</h2>
            <span className="text-xs text-accent font-medium flex items-center gap-0.5">
              View <ChevronRight className="w-3.5 h-3.5" />
            </span>
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
        </button>
      </div>
    </div>
  );
};

export default Home;
