import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Task {
  task_id?: string;
  title: string;
  notes?: string;
  priority: number;
  status: string;
  planned_datetime?: string;
  estimated_minutes: number;
  due_datetime?: string;
  category?: string | null;
  repeat?: 'none' | 'daily' | 'weekdays' | 'weekly';
  repeat_count?: number;
  repeat_until?: string;
  recurrence_series_id?: string | null;
  edit_scope?: 'single' | 'series';
}

const TASK_CATEGORIES = ['Work', 'Personal', 'Health', 'Errands', 'Study', 'Other'] as const;

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateLike(value: string) {
  if (!value) return null;
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface TaskEditModalProps {
  task: Task;
  mode?: 'create' | 'edit';
  onClose: () => void;
  onSave: (updatedTask: Task) => Promise<void>;
  onDelete?: (task: Task) => Promise<void>;
}

const TaskEditModal = ({ task, mode = 'edit', onClose, onSave, onDelete }: TaskEditModalProps) => {
  const [formData, setFormData] = useState<Task>(task);
  const [showAdditional, setShowAdditional] = useState<boolean>(() =>
    Boolean(task.planned_datetime || (task.estimated_minutes && task.estimated_minutes > 0))
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof Task, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    const trimmedTitle = (formData.title || '').trim();
    if (!trimmedTitle) {
      setError('Title is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const payload: Task = {
        ...formData,
        title: trimmedTitle,
        notes: formData.notes?.trim() || undefined,
        due_datetime: formData.due_datetime || undefined,
        planned_datetime: showAdditional ? formData.planned_datetime : undefined,
        estimated_minutes: showAdditional ? (formData.estimated_minutes || 0) : 0,
        category: formData.category || undefined,
      };
      if (!showAdditional) {
        payload.planned_datetime = undefined;
      }
      await onSave(payload);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save task';
      let supplementary: string | null = null;
      if (err instanceof ApiError && err.details != null) {
        const d = err.details;
        if (typeof d === 'object' && d !== null) {
          const nested = (d as { details?: unknown }).details;
          if (typeof nested === 'string' && nested.trim()) {
            supplementary = nested.trim();
          }
        } else if (typeof d === 'string' && d.trim() && d !== msg) {
          supplementary = d.trim();
        }
      }
      setError(supplementary ? `${msg}: ${supplementary}` : msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    try {
      setDeleting(true);
      setError(null);
      await onDelete(formData);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete task';
      setError(msg);
    } finally {
      setDeleting(false);
    }
  };

  const toLocalInputValue = (value?: string) => {
    if (!value) return '';
    if (value.length === 16 && value.includes('T')) return value;
    const d = parseDateLike(value);
    if (!d) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const toDateValue = (value?: string) => {
    if (!value) return '';
    const v = toLocalInputValue(value);
    return v ? v.slice(0, 10) : '';
  };
  const toTimeValue = (value?: string) => {
    if (!value) return '';
    const v = toLocalInputValue(value);
    return v ? v.slice(11, 16) : '';
  };
  const setDueFromDateAndTime = (date: string, time: string) => {
    if (!date && !time) {
      handleChange('due_datetime', undefined);
      return;
    }
    const d = date || localDateString();
    const t = time || '00:00';
    handleChange('due_datetime', `${d}T${t}`);
  };
  const setPlannedFromDateAndTime = (date: string, time: string) => {
    if (!date && !time) {
      handleChange('planned_datetime', undefined);
      return;
    }
    const d = date || localDateString();
    const t = time || '00:00';
    handleChange('planned_datetime', `${d}T${t}`);
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-end">
      <div className="w-full max-h-[90vh] bg-background rounded-t-2xl shadow-xl animate-in slide-in-from-bottom flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 pb-2 border-b border-border/50">
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
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-4">
          <div className="space-y-4 mb-6">
            {/* Title — required */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                Title <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Task title"
              />
            </div>

            {/* Priority & Category — same row */}
            <div className="flex gap-3">
              <div className="flex-1 min-w-0">
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Priority <span className="text-destructive">*</span>
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => handleChange('priority', parseInt(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value={1}>1 — Highest</option>
                  <option value={2}>2 — Medium</option>
                  <option value={3}>3 — Low</option>
                </select>
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Category <span className="text-muted-foreground text-xs">(optional)</span>
                </label>
                <select
                  value={formData.category || ''}
                  onChange={(e) => handleChange('category', e.target.value || undefined)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">No category</option>
                  {TASK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Due date & time — same row */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                Due date & time <span className="text-muted-foreground text-xs">(optional)</span>
              </label>
              <div className="flex gap-3">
                <input
                  type="date"
                  value={toDateValue(formData.due_datetime)}
                  onChange={(e) => setDueFromDateAndTime(e.target.value, toTimeValue(formData.due_datetime))}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <input
                  type="time"
                  value={toTimeValue(formData.due_datetime)}
                  onChange={(e) => setDueFromDateAndTime(toDateValue(formData.due_datetime), e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>

            {/* Notes — optional */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                Notes <span className="text-muted-foreground text-xs">(optional)</span>
              </label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => handleChange('notes', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                rows={2}
                placeholder="Add notes..."
              />
            </div>

            {/* Additional fields — collapsible */}
            <Collapsible open={showAdditional} onOpenChange={setShowAdditional}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm font-medium text-foreground hover:text-accent transition-colors">
                {showAdditional ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                Additional options
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                {/* Planned date & time — same row */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">
                    Planned time to complete
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="date"
                      value={toDateValue(formData.planned_datetime)}
                      onChange={(e) => setPlannedFromDateAndTime(e.target.value, toTimeValue(formData.planned_datetime))}
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <input
                      type="time"
                      value={toTimeValue(formData.planned_datetime)}
                      onChange={(e) => setPlannedFromDateAndTime(toDateValue(formData.planned_datetime), e.target.value)}
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    When you plan to work on this. Adds to your calendar.
                  </p>
                </div>

                {/* Estimated duration */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">
                    Estimated duration (minutes)
                  </label>
                  <input
                    type="number"
                    value={formData.estimated_minutes || ''}
                    onChange={(e) =>
                      handleChange('estimated_minutes', parseInt(e.target.value, 10) || 0)
                    }
                    className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="e.g. 30"
                    min="0"
                  />
                </div>

                {mode === 'create' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Repeat</label>
                      <select
                        value={formData.repeat || 'none'}
                        onChange={(e) => handleChange('repeat', e.target.value as Task['repeat'])}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        <option value="none">Does not repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekdays">Weekdays</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </div>
                    {(formData.repeat || 'none') !== 'none' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1 block">Occurrences</label>
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={formData.repeat_count || 5}
                            onChange={(e) => handleChange('repeat_count', parseInt(e.target.value, 10) || 1)}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1 block">Repeat until</label>
                          <input
                            type="date"
                            value={formData.repeat_until || ''}
                            onChange={(e) => handleChange('repeat_until', e.target.value || undefined)}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Status — edit mode only */}
                {mode === 'edit' && (
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
                )}

                {mode === 'edit' && formData.recurrence_series_id ? (
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">Apply changes to</label>
                    <select
                      value={formData.edit_scope || 'single'}
                      onChange={(e) => handleChange('edit_scope', e.target.value as Task['edit_scope'])}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="single">Only this task</option>
                      <option value="series">All tasks in this series</option>
                    </select>
                  </div>
                ) : null}
              </CollapsibleContent>
            </Collapsible>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex gap-3 p-4 pt-2 border-t border-border/50">
          {mode === 'edit' && onDelete ? (
            <button
              onClick={handleDelete}
              disabled={deleting || saving}
              className="px-4 py-2 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors font-medium disabled:opacity-50"
            >
              {deleting ? 'DELETING…' : 'DELETE'}
            </button>
          ) : null}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-border text-foreground hover:bg-muted transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || deleting}
            className="flex-1 px-4 py-2 rounded-lg bg-accent text-white hover:opacity-90 transition-opacity font-semibold tracking-wide uppercase disabled:opacity-50"
          >
            {saving ? (mode === 'create' ? 'ADDING…' : 'SAVING…') : mode === 'create' ? 'ADD TASK' : 'SAVE'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TaskEditModal;
