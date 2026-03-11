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
  task_id: string;
  title: string;
  notes?: string;
  priority: number;
  status: string;
  estimated_minutes: number;
  due_datetime?: string;
}

const Tasks = () => {
  const { crisisMode } = useApp();
  const { token } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

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
      await apiJson(`/api/me/tasks/${updatedTask.task_id}`, {
        method: 'PUT',
        token: token || undefined,
        body: JSON.stringify({
          title: updatedTask.title,
          notes: updatedTask.notes,
          priority: updatedTask.priority,
          status: updatedTask.status,
          estimated_minutes: updatedTask.estimated_minutes,
          due_datetime: updatedTask.due_datetime,
        }),
      });
      
      // Update local state
      setTasks(tasks.map(t => t.task_id === updatedTask.task_id ? updatedTask : t));
    } catch (err) {
      console.error('Error saving task:', err);
      throw err;
    }
  };

  // Helper function to check if a date is today
  const isToday = (dateString: string | undefined) => {
    if (!dateString) return false;
    const taskDate = new Date(dateString);
    const today = new Date();
    return (
      taskDate.getFullYear() === today.getFullYear() &&
      taskDate.getMonth() === today.getMonth() &&
      taskDate.getDate() === today.getDate()
    );
  };

  // Helper function to format date
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Group tasks by priority and due date
  const priorityTasks = tasks.filter(t => t.priority === 1 && t.status !== 'completed');
  const todayTasks = tasks.filter(t => isToday(t.due_datetime) && t.status !== 'completed');
  const otherTasks = tasks.filter(t => !isToday(t.due_datetime) && t.due_datetime && t.status !== 'completed')
    .sort((a, b) => {
      const dateA = new Date(a.due_datetime || '');
      const dateB = new Date(b.due_datetime || '');
      return dateA.getTime() - dateB.getTime();
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

        {/* Priority Section */}
        {priorityTasks.length > 0 && (
          <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
            <h2 className="text-sm font-semibold text-foreground mb-2">Priority</h2>
            {priorityTasks.map(task => (
              <TaskItem
                key={task.task_id}
                title={task.title}
                subtitle={task.notes || 'Work'}
                duration={task.estimated_minutes}
                dueDate={task.due_datetime ? formatDate(task.due_datetime) : undefined}
                completed={task.status === 'completed'}
                onEdit={() => setEditingTask(task)}
              />
            ))}
          </div>
        )}

        {/* Today Section */}
        {todayTasks.length > 0 && (
          <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
            <h2 className="text-sm font-semibold text-foreground mb-2">Today</h2>
            {todayTasks.map(task => (
              <TaskItem
                key={task.task_id}
                title={task.title}
                subtitle={task.notes || 'Work'}
                duration={task.estimated_minutes}
                completed={task.status === 'completed'}
                onEdit={() => setEditingTask(task)}
              />
            ))}
          </div>
        )}

        {/* Other Section */}
        {otherTasks.length > 0 && (
          <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
            <h2 className="text-sm font-semibold text-foreground mb-2">Other</h2>
            {otherTasks.map(task => (
              <TaskItem
                key={task.task_id}
                title={task.title}
                subtitle={task.notes || 'Work'}
                duration={task.estimated_minutes}
                dueDate={task.due_datetime ? formatDate(task.due_datetime) : undefined}
                completed={task.status === 'completed'}
                onEdit={() => setEditingTask(task)}
              />
            ))}
          </div>
        )}

        {/* FAB */}
        <button className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity z-40">
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* Edit Modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={handleSaveTask}
        />
      )}
    </div>
  );
};

export default Tasks;
