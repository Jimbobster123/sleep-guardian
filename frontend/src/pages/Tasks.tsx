import PageHeader from '@/components/PageHeader';
import TaskItem from '@/components/TaskItem';
import TaskEditModal from '@/components/TaskEditModal';
import TimeBudgetBar from '@/components/TimeBudgetBar';
import { Plus } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiJson } from '@/lib/api';
import { format } from 'date-fns';

interface Task {
  task_id?: string;
  title: string;
  notes?: string;
  priority: number;
  status: string;
  estimated_minutes: number;
  planned_datetime?: string;
  due_datetime?: string;
  created_at?: string;
  category?: string | null;
}

type SleepGoalResponse = {
  goal: { target_bedtime: string | null; target_wake_time: string | null } | null;
  windows: Array<{ day_of_week: number; start_time: string; end_time: string }>;
};

type CalendarEvent = { start_datetime: string; end_datetime: string };

function formatDateTime(dateString: string | undefined) {
  if (!dateString) return undefined;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const Tasks = () => {
  const { crisisMode } = useApp();
  const { token } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sleepGoal, setSleepGoal] = useState<SleepGoalResponse | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [mode, setMode] = useState<'create' | 'edit'>('edit');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const dateStr = format(new Date(), 'yyyy-MM-dd');
        const tasksRes = await apiJson<Task[]>('/api/me/tasks', { token });
        if (cancelled) return;
        setTasks(tasksRes);

        const [goalRes, eventsRes] = await Promise.all([
          apiJson<SleepGoalResponse>('/api/me/sleep-goal', { token }).catch(() => null),
          apiJson<CalendarEvent[]>(
            `/api/me/calendar-events?from=${encodeURIComponent(`${dateStr} 00:00:00`)}&to=${encodeURIComponent(`${dateStr} 23:59:59`)}`,
            { token }
          ).catch(() => []),
        ]);
        if (cancelled) return;
        setSleepGoal(goalRes);
        setCalendarEvents(Array.isArray(eventsRes) ? eventsRes : []);
      } catch (err) {
        if (!cancelled) {
          console.error('Error fetching data:', err);
          setError(err instanceof Error ? err.message : 'Failed to load tasks');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleSaveTask = async (updatedTask: Task) => {
    try {
      if (!token) throw new Error('Not authenticated');

      if (!updatedTask.task_id) {
        // Create
        const created = await apiJson<Task>('/api/me/tasks', {
          method: 'POST',
          token,
          body: JSON.stringify({
            title: updatedTask.title,
            notes: updatedTask.notes,
            priority: updatedTask.priority,
            status: updatedTask.status,
            planned_datetime: updatedTask.planned_datetime,
            estimated_minutes: updatedTask.estimated_minutes,
            due_datetime: updatedTask.due_datetime,
            category: updatedTask.category || null,
          }),
        });
        setTasks((prev) => [...prev, created]);
      } else {
        // Update
        await apiJson(`/api/me/tasks/${updatedTask.task_id}`, {
          method: 'PUT',
          token,
          body: JSON.stringify({
            title: updatedTask.title,
            notes: updatedTask.notes,
            priority: updatedTask.priority,
            status: updatedTask.status,
            planned_datetime: updatedTask.planned_datetime,
            estimated_minutes: updatedTask.estimated_minutes,
            due_datetime: updatedTask.due_datetime,
            category: updatedTask.category || null,
          }),
        });

        // Update local state
        setTasks((prev) =>
          prev.map((t) => (t.task_id === updatedTask.task_id ? updatedTask : t)),
        );
      }
    } catch (err) {
      console.error('Error saving task:', err);
      throw err;
    }
  };

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  type ViewMode = 'all' | 'due_today' | 'by_due_date' | 'by_priority';
  const [viewMode, setViewMode] = useState<ViewMode>('by_due_date');

  const visibleTasks = tasks.filter((t) => t.status !== 'completed');

  // Filter and sort based on view mode
  const displayedTasks = (() => {
    let filtered = visibleTasks;

    if (viewMode === 'all') {
      return [...filtered].sort((a, b) => {
        const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
        return aCreated - bCreated; // oldest first (order of creation)
      });
    }

    if (viewMode === 'due_today') {
      filtered = visibleTasks
        .filter((t) => {
          if (!t.due_datetime) return false;
          const due = new Date(t.due_datetime).getTime();
          return due >= startOfToday && due <= endOfToday;
        })
        .sort((a, b) => {
          const aDue = new Date(a.due_datetime!).getTime();
          const bDue = new Date(b.due_datetime!).getTime();
          return aDue - bDue;
        });
      return filtered;
    }

    if (viewMode === 'by_due_date') {
      return [...filtered].sort((a, b) => {
        const aDue = a.due_datetime ? new Date(a.due_datetime).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.due_datetime ? new Date(b.due_datetime).getTime() : Number.MAX_SAFE_INTEGER;
        return aDue - bDue; // earliest first, no due date at bottom
      });
    }

    if (viewMode === 'by_priority') {
      return [...filtered].sort((a, b) => {
        const prio = (a.priority || 3) - (b.priority || 3);
        if (prio !== 0) return prio; // 1 first, then 2, then 3
        // secondary: by due date
        const aDue = a.due_datetime ? new Date(a.due_datetime).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.due_datetime ? new Date(b.due_datetime).getTime() : Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
      });
    }

    return filtered;
  })();

  // Time budget: available = (now → bedtime today) minus planned events
  const { availableMinutes, taskMinutesToday } = useMemo(() => {
    const now = new Date();
    const dow = now.getDay(); // 0=Sun, 6=Sat
    const windowForDay = (sleepGoal?.windows || []).find((w) => w.day_of_week === dow);
    const bedTimeStr = String(
      windowForDay?.start_time || sleepGoal?.goal?.target_bedtime || '23:00:00'
    ).slice(0, 5);
    const [bh, bm] = bedTimeStr.split(':').map(Number);
    const bedtimeToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), bh || 23, bm || 0, 0);

    let availableMs = bedtimeToday.getTime() - now.getTime();
    if (availableMs <= 0) {
      return { availableMinutes: 0, taskMinutesToday: 0 };
    }

    // Subtract event durations that overlap [now, bedtime]
    for (const ev of calendarEvents) {
      const start = new Date(ev.start_datetime.replace(' ', 'T'));
      const end = new Date(ev.end_datetime.replace(' ', 'T'));
      const overlapStart = start < now ? now : start;
      const overlapEnd = end > bedtimeToday ? bedtimeToday : end;
      if (overlapStart < overlapEnd) {
        availableMs -= overlapEnd.getTime() - overlapStart.getTime();
      }
    }
    const availableMinutes = Math.max(0, Math.floor(availableMs / 60_000));

    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    const todayTasks = tasks.filter((t) => {
      if (t.status === 'completed') return false;
      if (!t.due_datetime) return false;
      const due = new Date(t.due_datetime).getTime();
      return due >= startToday && due <= endToday;
    });
    const taskMinutesToday = todayTasks.reduce((sum, t) => sum + (t.estimated_minutes || 0), 0);

    return { availableMinutes, taskMinutesToday };
  }, [tasks, sleepGoal, calendarEvents]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Tasks" compact />
        <div className="px-5 py-6 text-center text-foreground/50">Loading tasks...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Tasks" compact />
        <div className="px-5 py-6 text-center text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Tasks" compact />

      <div className="px-5 -mt-2 space-y-4 pb-6">
        {/* Time Budget */}
        <TimeBudgetBar
          availableMinutes={availableMinutes}
          taskMinutesToday={taskMinutesToday}
        />

        {crisisMode && (
          <div className="bg-crisis-light border border-crisis/20 rounded-xl p-3">
            <p className="text-xs text-crisis font-medium">
              🎯 Crisis Mode: Focus on must-do tasks only. Consider deferring lower-priority tasks.
            </p>
          </div>
        )}

        {/* Filter buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setViewMode('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'all'
                ? 'bg-accent text-accent-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            All Tasks
          </button>
          <button
            onClick={() => setViewMode('due_today')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'due_today'
                ? 'bg-accent text-accent-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Due Today
          </button>
          <button
            onClick={() => setViewMode('by_due_date')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'by_due_date'
                ? 'bg-accent text-accent-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            By Due Date
          </button>
          <button
            onClick={() => setViewMode('by_priority')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'by_priority'
                ? 'bg-accent text-accent-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            By Priority
          </button>
        </div>

        {/* All tasks in one list */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-2">
            {viewMode === 'all'
              ? 'All Tasks'
              : viewMode === 'due_today'
                ? 'Tasks Due Today'
                : viewMode === 'by_due_date'
                  ? 'Tasks by Due Date'
                  : 'Tasks by Priority'}
          </h2>
          {displayedTasks.length > 0 ? (
            <div className="space-y-2">
              {displayedTasks.map((task) => (
                <TaskItem
                  key={task.task_id}
                  title={task.title}
                  subtitle={task.notes}
                  category={task.category}
                  duration={task.estimated_minutes && task.estimated_minutes > 0 ? task.estimated_minutes : undefined}
                  plannedDate={formatDateTime(task.planned_datetime)}
                  dueDate={formatDateTime(task.due_datetime)}
                  completed={task.status === 'completed'}
                  onEdit={() => { setEditingTask(task); setMode('edit'); }}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {viewMode === 'due_today' ? 'No tasks due today.' : 'No tasks.'}
            </p>
          )}
        </div>

        {/* FAB */}
        <button
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity z-40"
          onClick={() => {
            setEditingTask({
              title: '',
              notes: '',
              priority: 3,
              status: 'pending',
              estimated_minutes: 0,
              planned_datetime: undefined,
              due_datetime: undefined,
              category: undefined,
            });
            setMode('create');
          }}
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* Edit Modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          mode={mode}
          onClose={() => setEditingTask(null)}
          onSave={handleSaveTask}
        />
      )}
    </div>
  );
};

export default Tasks;
