import PageHeader from '@/components/PageHeader';
import TaskItem from '@/components/TaskItem';
import TaskEditModal from '@/components/TaskEditModal';
import TimeBudgetBar from '@/components/TimeBudgetBar';
import { Plus } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiJson } from '@/lib/api';
import { isTaskPastDue } from '@/lib/taskOverdue';
import { format, isToday } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';

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
  if (String(dateString).trim().endsWith('23:59:59')) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function parseTaskDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const raw = String(s).includes('T') ? s : String(s).replace(' ', 'T');
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local calendar day matches "today" (due or planned). */
function isLocalToday(s: string | undefined | null): boolean {
  const d = parseTaskDate(s);
  return d != null && isToday(d);
}

function plannedMs(t: Task): number | null {
  if (!t.planned_datetime) return null;
  const d = parseTaskDate(t.planned_datetime);
  return d ? d.getTime() : null;
}

function dueMs(t: Task): number | null {
  if (!t.due_datetime) return null;
  const d = parseTaskDate(t.due_datetime);
  return d ? d.getTime() : null;
}

/** Earliest plan or deadline — tasks with only a plan still sort among dated items. */
function taskScheduleSortMsActive(t: Task): number {
  const candidates = [plannedMs(t), dueMs(t)].filter(
    (x): x is number => x != null && !Number.isNaN(x),
  );
  if (candidates.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(...candidates);
}

/** Latest plan or deadline — for completed lists, “newest” by schedule. */
function taskScheduleSortMsCompleted(t: Task): number {
  const candidates = [plannedMs(t), dueMs(t)].filter(
    (x): x is number => x != null && !Number.isNaN(x),
  );
  if (candidates.length === 0) return Number.NEGATIVE_INFINITY;
  return Math.max(...candidates);
}

function compareScheduleActive(a: Task, b: Task): number {
  return taskScheduleSortMsActive(a) - taskScheduleSortMsActive(b);
}

function compareScheduleCompleted(a: Task, b: Task): number {
  const aMs = taskScheduleSortMsCompleted(a);
  const bMs = taskScheduleSortMsCompleted(b);
  if (aMs !== bMs) return bMs - aMs;
  const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
  const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
  return bCreated - aCreated;
}

/** For Today scope + date sort: planned time first when both are today. */
function effectiveTodaySortMs(t: Task): number {
  const p =
    t.planned_datetime && isLocalToday(t.planned_datetime)
      ? parseTaskDate(t.planned_datetime)!.getTime()
      : null;
  const d = t.due_datetime && isLocalToday(t.due_datetime) ? parseTaskDate(t.due_datetime)!.getTime() : null;
  if (p != null && d != null) return p;
  if (p != null) return p;
  if (d != null) return d;
  return Number.MAX_SAFE_INTEGER;
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
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

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

  const handleTaskCompletion = async (taskId: string | undefined, checked: boolean) => {
    if (!token || !taskId) return;

    const nextStatus = checked ? 'completed' : 'pending';
    const previousTasks = tasks;

    setUpdatingTaskId(taskId);
    setTasks((prev) =>
      prev.map((task) =>
        task.task_id === taskId ? { ...task, status: nextStatus } : task,
      ),
    );

    try {
      const updated = await apiJson<Task>(`/api/me/tasks/${taskId}/status`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status: nextStatus }),
      });

      setTasks((prev) =>
        prev.map((task) => (task.task_id === taskId ? updated : task)),
      );

      if (checked) {
        toast.success('Task marked completed');
      }
    } catch (err) {
      setTasks(previousTasks);
      console.error('Error updating task status:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update task status');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  type ListScope = 'all' | 'today' | 'late' | 'completed';
  type SortMode = 'date' | 'priority' | 'category';

  const [listScope, setListScope] = useState<ListScope>('all');
  const [sortMode, setSortMode] = useState<SortMode>('date');

  const displayedTasks = useMemo(() => {
    let base: Task[];
    if (listScope === 'completed') {
      base = tasks.filter((t) => t.status === 'completed');
    } else {
      base = tasks.filter((t) => t.status !== 'completed');
      if (listScope === 'today') {
        base = base.filter((t) => isLocalToday(t.due_datetime) || isLocalToday(t.planned_datetime));
      } else if (listScope === 'late') {
        base = base.filter((t) => isTaskPastDue(t.status, t.due_datetime));
      }
    }

    const sorted = [...base].sort((a, b) => {
      const isCompleted = listScope === 'completed';

      if (sortMode === 'priority') {
        const pr = (a.priority || 3) - (b.priority || 3);
        if (pr !== 0) return pr;
        return isCompleted ? compareScheduleCompleted(a, b) : compareScheduleActive(a, b);
      }

      if (sortMode === 'category') {
        const ca = (a.category || '').trim().toLocaleLowerCase();
        const cb = (b.category || '').trim().toLocaleLowerCase();
        const aEmpty = !ca;
        const bEmpty = !cb;
        if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
        if (ca !== cb) return ca.localeCompare(cb);
        return isCompleted ? compareScheduleCompleted(a, b) : compareScheduleActive(a, b);
      }

      // date (plan + deadline)
      if (!isCompleted && listScope === 'today') {
        return effectiveTodaySortMs(a) - effectiveTodaySortMs(b);
      }
      if (listScope === 'late') {
        return compareScheduleActive(a, b);
      }
      return isCompleted ? compareScheduleCompleted(a, b) : compareScheduleActive(a, b);
    });

    return sorted;
  }, [tasks, listScope, sortMode]);

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

    const todayTasks = tasks.filter((t) => {
      if (t.status === 'completed') return false;
      return isLocalToday(t.due_datetime) || isLocalToday(t.planned_datetime);
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

        <div className="rounded-xl border border-border/50 bg-muted/25 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4">
            <div className="flex-1 min-w-0 space-y-1.5">
              <label htmlFor="tasks-show-scope" className="text-xs font-medium text-muted-foreground">
                Show
              </label>
              <Select
                value={listScope}
                onValueChange={(v) => setListScope(v as ListScope)}
              >
                <SelectTrigger id="tasks-show-scope" className="h-9 w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tasks</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                  <SelectItem value="completed">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <label htmlFor="tasks-sort" className="text-xs font-medium text-muted-foreground">
                Sort by
              </label>
              <Select
                value={sortMode}
                onValueChange={(v) => setSortMode(v as SortMode)}
              >
                <SelectTrigger id="tasks-sort" className="h-9 w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="category">Category</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* All tasks in one list */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-2">
            {listScope === 'all'
              ? 'All tasks'
              : listScope === 'today'
                ? 'Today — due or planned today'
                : listScope === 'late'
                  ? 'Late — overdue and not completed'
                  : 'Completed'}
          </h2>
          {displayedTasks.length > 0 ? (
            <div className="space-y-2">
              {displayedTasks.map((task) => (
                <TaskItem
                  key={task.task_id}
                  taskId={task.task_id}
                  title={task.title}
                  subtitle={task.notes}
                  category={task.category}
                  priority={task.priority}
                  duration={task.estimated_minutes && task.estimated_minutes > 0 ? task.estimated_minutes : undefined}
                  plannedDate={formatDateTime(task.planned_datetime)}
                  dueDate={formatDateTime(task.due_datetime)}
                  completed={task.status === 'completed'}
                  pastDue={isTaskPastDue(task.status, task.due_datetime)}
                  completing={updatingTaskId === task.task_id}
                  onToggleComplete={(checked) => handleTaskCompletion(task.task_id, checked)}
                  onEdit={() => { setEditingTask(task); setMode('edit'); }}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {listScope === 'today'
                ? 'Nothing due or planned for today.'
                : listScope === 'late'
                  ? 'No overdue tasks — you’re all caught up.'
                  : listScope === 'completed'
                    ? 'No completed tasks yet.'
                    : 'No tasks.'}
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
