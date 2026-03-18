import PageHeader from '@/components/PageHeader';
import TaskItem from '@/components/TaskItem';
import EmotionalCheckIn from '@/components/EmotionalCheckIn';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiJson } from '@/lib/api';
import { Moon, Flame, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

interface Task {
  task_id?: string;
  title: string;
  notes?: string | null;
  priority: number;
  status: string;
  estimated_minutes: number;
  due_datetime?: string | null;
}

const Home = () => {
  const { bedtime, streak, crisisMode } = useApp();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [taskError, setTaskError] = useState<string | null>(null);

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
                subtitle={task.notes || 'No notes'}
                duration={task.estimated_minutes}
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
                subtitle={task.notes || 'No notes'}
                duration={task.estimated_minutes}
                dueDate={formatDate(task.due_datetime)}
                completed={task.status === 'completed'}
              />
            ))
          )}
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
