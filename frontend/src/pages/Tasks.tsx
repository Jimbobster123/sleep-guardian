import PageHeader from '@/components/PageHeader';
import TaskItem from '@/components/TaskItem';
import TaskEditModal from '@/components/TaskEditModal';
import TimeBudgetBar from '@/components/TimeBudgetBar';
import { Plus } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiJson } from '@/lib/api';

interface Task {
  task_id?: string;
  title: string;
  notes?: string;
  priority: number;
  status: string;
  estimated_minutes: number;
  planned_datetime?: string;
  due_datetime?: string;
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [mode, setMode] = useState<'create' | 'edit'>('edit');

  useEffect(() => {
    if (!token) return;
    fetchTasks();
  }, [token]);

  const fetchTasks = async () => {
    try {
      const data = await apiJson<Task[]>('/api/me/tasks', { token: token || undefined });
      setTasks(data);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

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

  const visibleTasks = tasks.filter((t) => t.status !== 'completed');

  // Priority tasks (priority=1), sorted by planned date.
  const priorityTasks = visibleTasks
    .filter((t) => t.priority === 1)
    .sort((a, b) => {
      const aPlanned = a.planned_datetime ? new Date(a.planned_datetime).getTime() : Number.MAX_SAFE_INTEGER;
      const bPlanned = b.planned_datetime ? new Date(b.planned_datetime).getTime() : Number.MAX_SAFE_INTEGER;
      return aPlanned - bPlanned;
    });

  // Future: tasks with a due date in the future, sorted by planned date.
  const futureTasks = visibleTasks
    .filter((t) => t.due_datetime && new Date(t.due_datetime).getTime() >= now.getTime())
    .sort((a, b) => {
      const aPlanned = a.planned_datetime ? new Date(a.planned_datetime).getTime() : Number.MAX_SAFE_INTEGER;
      const bPlanned = b.planned_datetime ? new Date(b.planned_datetime).getTime() : Number.MAX_SAFE_INTEGER;
      return aPlanned - bPlanned;
    });

  // Other: tasks without a due date (no due_datetime)
  const otherTasks = visibleTasks
    .filter((t) => !t.due_datetime)
    .sort((a, b) => {
      const aPlanned = a.planned_datetime ? new Date(a.planned_datetime).getTime() : Number.MAX_SAFE_INTEGER;
      const bPlanned = b.planned_datetime ? new Date(b.planned_datetime).getTime() : Number.MAX_SAFE_INTEGER;
      return aPlanned - bPlanned;
    });

  // Past: tasks with a due date in the past.
  const pastTasks = visibleTasks
    .filter((t) => t.due_datetime && new Date(t.due_datetime).getTime() < now.getTime())
    .sort((a, b) => {
      const aPlanned = a.planned_datetime ? new Date(a.planned_datetime).getTime() : new Date(a.due_datetime || 0).getTime();
      const bPlanned = b.planned_datetime ? new Date(b.planned_datetime).getTime() : new Date(b.due_datetime || 0).getTime();
      return bPlanned - aPlanned; // most recent planned first
    });

  const totalEstimatedMinutes = tasks.reduce((sum, t) => sum + (t.estimated_minutes || 0), 0);
  const completedMinutes = tasks
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + (t.estimated_minutes || 0), 0);

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
          totalMinutes={totalEstimatedMinutes}
          usedMinutes={completedMinutes}
          bedtimeShift={`You have ${totalEstimatedMinutes - completedMinutes} minutes of tasks remaining.`}
        />

        {crisisMode && (
          <div className="bg-crisis-light border border-crisis/20 rounded-xl p-3">
            <p className="text-xs text-crisis font-medium">
              🎯 Crisis Mode: Focus on must-do tasks only. Consider deferring "Other" tasks.
            </p>
          </div>
        )}

        {/* Priority Tasks */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-2">Priority Tasks</h2>
          {priorityTasks.length > 0 ? (
            priorityTasks.map((task) => (
              <TaskItem
                key={task.task_id}
                title={task.title}
                subtitle={task.notes || 'Work'}
                duration={task.estimated_minutes}
                plannedDate={formatDateTime(task.planned_datetime)}
                dueDate={formatDateTime(task.due_datetime)}
                completed={task.status === 'completed'}
                onEdit={() => setEditingTask(task)}
              />
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No priority tasks.</p>
          )}
        </div>

        {/* Future Tasks */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-2">Future Tasks</h2>
          {futureTasks.length > 0 ? (
            futureTasks.map((task) => (
              <TaskItem
                key={task.task_id}
                title={task.title}
                subtitle={task.notes || 'Work'}
                duration={task.estimated_minutes}
                plannedDate={formatDateTime(task.planned_datetime)}
                dueDate={formatDateTime(task.due_datetime)}
                completed={task.status === 'completed'}
                onEdit={() => setEditingTask(task)}
              />
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No future tasks.</p>
          )}
        </div>

        {/* Other Tasks (no due date) */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-2">Other Tasks</h2>
          {otherTasks.length > 0 ? (
            otherTasks.map((task) => (
              <TaskItem
                key={task.task_id}
                title={task.title}
                subtitle={task.notes || 'Work'}
                duration={task.estimated_minutes}
                plannedDate={formatDateTime(task.planned_datetime)}
                dueDate={undefined}
                completed={task.status === 'completed'}
                onEdit={() => setEditingTask(task)}
              />
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No other tasks.</p>
          )}
        </div>

        {/* Past Tasks */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <h2 className="text-sm font-semibold text-foreground mb-2">Past Tasks</h2>
          {pastTasks.length > 0 ? (
            pastTasks.map((task) => (
              <TaskItem
                key={task.task_id}
                title={task.title}
                subtitle={task.notes || 'Work'}
                duration={task.estimated_minutes}
                plannedDate={formatDateTime(task.planned_datetime)}
                dueDate={formatDateTime(task.due_datetime)}
                completed={task.status === 'completed'}
                onEdit={() => setEditingTask(task)}
              />
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No past tasks.</p>
          )}
        </div>

        {/* FAB */}
        <button
          className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity z-40"
          onClick={() => {
            const now = new Date();
            now.setMinutes(now.getMinutes() + 30 - (now.getMinutes() % 30));
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const defaultDue = `${year}-${month}-${day}T${hours}:${minutes}`;
            setEditingTask({
              title: '',
              notes: '',
              priority: 3,
              status: 'pending',
              estimated_minutes: 30,
              planned_datetime: defaultDue,
              due_datetime: defaultDue,
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
