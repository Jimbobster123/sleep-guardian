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
  repeat?: 'none' | 'daily' | 'weekdays' | 'weekly';
  repeat_count?: number;
  repeat_until?: string;
  recurrence_series_id?: string | null;
  edit_scope?: 'single' | 'series';
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
        const created = await apiJson<Task | { tasks: Task[] }>('/api/me/tasks', {
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
            repeat: updatedTask.repeat || 'none',
            repeat_count: updatedTask.repeat_count || 1,
            repeat_until: updatedTask.repeat_until || null,
          }),
        });
        if ('tasks' in created && Array.isArray(created.tasks)) {
          setTasks((prev) => [...prev, ...created.tasks]);
        } else {
          setTasks((prev) => [...prev, created]);
        }
      } else {
        // Update
        const res = await apiJson<Task | { tasks: Task[] }>(
          `/api/me/tasks/${updatedTask.task_id}?scope=${encodeURIComponent(updatedTask.edit_scope || 'single')}`,
          {
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
          },
        );

        if ('tasks' in res && Array.isArray(res.tasks) && res.tasks.length) {
          const byId = new Map(res.tasks.map((t) => [t.task_id, t]));
          setTasks((prev) => prev.map((t) => (byId.has(t.task_id!) ? (byId.get(t.task_id!) as Task) : t)));
        } else {
          setTasks((prev) => prev.map((t) => (t.task_id === updatedTask.task_id ? (res as Task) : t)));
        }
      }
    } catch (err) {
      console.error('Error saving task:', err);
      throw err;
    }
  };

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  type ListScope = 'all' | 'due_today';
  type OrganizeBy = 'due_date' | 'priority' | 'category';

  const [listScope, setListScope] = useState<ListScope>('all');
  const [organizeBy, setOrganizeBy] = useState<OrganizeBy>('due_date');

  const organizeLabels: Record<OrganizeBy, string> = {
    due_date: 'Due date',
    priority: 'Priority',
    category: 'Category',
  };

  const cycleOrganize = () => {
    setOrganizeBy((prev) => {
      if (prev === 'due_date') return 'priority';
      if (prev === 'priority') return 'category';
      return 'due_date';
    });
  };

  const displayedTasks = useMemo(() => {
    const visibleTasks = tasks.filter((t) => t.status !== 'completed');
    let filtered =
      listScope === 'due_today'
        ? visibleTasks.filter((t) => {
            if (!t.due_datetime) return false;
            const due = new Date(t.due_datetime).getTime();
            return due >= startOfToday && due <= endOfToday;
          })
        : [...visibleTasks];

    const byDueDate = (a: Task, b: Task) => {
      const aDue = a.due_datetime ? new Date(a.due_datetime).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.due_datetime ? new Date(b.due_datetime).getTime() : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    };

    const byPriorityThenDue = (a: Task, b: Task) => {
      const prio = (a.priority || 3) - (b.priority || 3);
      if (prio !== 0) return prio;
      return byDueDate(a, b);
    };

    const byCategoryThenDue = (a: Task, b: Task) => {
      const ac = (a.category || '').trim() || '\uFFFF';
      const bc = (b.category || '').trim() || '\uFFFF';
      const cmp = ac.localeCompare(bc, undefined, { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      return byDueDate(a, b);
    };

    if (organizeBy === 'due_date') {
      filtered.sort(byDueDate);
    } else if (organizeBy === 'priority') {
      filtered.sort(byPriorityThenDue);
    } else {
      filtered.sort(byCategoryThenDue);
    }

    return filtered;
  }, [tasks, listScope, organizeBy, startOfToday, endOfToday]);

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

        {/* Scope buttons + sort toggle group */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setListScope('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              listScope === 'all'
                ? 'bg-accent text-accent-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            All tasks
          </button>
          <button
            type="button"
            onClick={() => setListScope('due_today')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              listScope === 'due_today'
                ? 'bg-accent text-accent-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Due today
          </button>

          {/* Sort segmented toggle (only these three) */}
          <div className="rounded-xl border border-border bg-muted/40 p-1 flex gap-1">
            <button
              type="button"
              onClick={() => setOrganizeBy('due_date')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                organizeBy === 'due_date'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              Due date
            </button>
            <button
              type="button"
              onClick={() => setOrganizeBy('priority')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                organizeBy === 'priority'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              Priority
            </button>
            <button
              type="button"
              onClick={() => setOrganizeBy('category')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                organizeBy === 'category'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              Category
            </button>
          </div>
        </div>

        {/* All tasks in one list */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-2">
            {listScope === 'all' ? 'All tasks' : 'Due today'}
            <span className="text-muted-foreground font-normal"> · {organizeLabels[organizeBy]}</span>
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
              {listScope === 'due_today' ? 'No tasks due today.' : 'No tasks.'}
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
              repeat: 'none',
              repeat_count: 5,
              repeat_until: undefined,
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
          onDelete={async (task) => {
            if (!token || !task.task_id) throw new Error('Task not found');
            await apiJson(`/api/me/tasks/${task.task_id}?scope=${encodeURIComponent(task.edit_scope || 'single')}`, {
              method: 'DELETE',
              token,
            });
            if ((task.edit_scope || 'single') === 'series' && task.recurrence_series_id) {
              setTasks((prev) => prev.filter((t) => t.recurrence_series_id !== task.recurrence_series_id));
            } else {
              setTasks((prev) => prev.filter((t) => t.task_id !== task.task_id));
            }
          }}
        />
      )}
    </div>
  );
};

export default Tasks;
