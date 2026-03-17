import { X } from 'lucide-react';
import { useState } from 'react';

interface Task {
  task_id?: string;
  title: string;
  notes?: string;
  priority: number;
  status: string;
  estimated_minutes: number;
  due_datetime?: string;
}

interface TaskEditModalProps {
  task: Task;
  mode?: 'create' | 'edit';
  onClose: () => void;
  onSave: (updatedTask: Task) => Promise<void>;
}

const TaskEditModal = ({ task, mode = 'edit', onClose, onSave }: TaskEditModalProps) => {
  const [formData, setFormData] = useState<Task>(task);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof Task, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const toLocalInputValue = (value?: string) => {
    if (!value) return '';
    // If it's already a local datetime-local string, use it as-is
    if (value.length === 16 && value.includes('T')) return value;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="w-full bg-background rounded-t-2xl p-6 shadow-xl animate-in slide-in-from-bottom">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">
            {mode === 'create' ? 'Add Task' : 'Edit Task'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4 mb-6">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Task title"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Notes</label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              rows={3}
              placeholder="Add notes..."
            />
          </div>

          {/* Priority */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Priority</label>
            <select
              value={formData.priority}
              onChange={(e) => handleChange('priority', parseInt(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value={1}>Priority</option>
              <option value={2}>Today</option>
              <option value={3}>Other</option>
            </select>
          </div>

          {/* Due Date */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Due Date</label>
            <input
              type="datetime-local"
              value={toLocalInputValue(formData.due_datetime)}
              onChange={(e) => handleChange('due_datetime', e.target.value || undefined)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* Estimated Minutes */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Duration (minutes)</label>
            <input
              type="number"
              value={formData.estimated_minutes}
              onChange={(e) => handleChange('estimated_minutes', parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="0"
              min="0"
            />
          </div>

          {/* Status */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Status</label>
            <select
              value={formData.status}
              onChange={(e) => handleChange('status', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-border text-foreground hover:bg-muted transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-accent text-white hover:opacity-90 transition-opacity font-semibold tracking-wide uppercase disabled:opacity-50"
          >
            {saving ? (mode === 'create' ? 'ADDING TASK…' : 'SAVING…') : mode === 'create' ? 'ADD TASK' : 'SAVE'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskEditModal;
