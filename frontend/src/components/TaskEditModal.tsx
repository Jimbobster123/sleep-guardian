import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { ApiError, apiJson } from '@/lib/api';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/contexts/AuthContext';
import { effectiveTimeZone, parseApiTimestamp } from '@/lib/calendarTime';
import { blurNumberInputOnWheel } from '@/lib/utils';
import { DateTime } from 'luxon';

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

type PlanSuggestionResponse = {
  suggested_planned_datetime: string | null;
  suggested_block_end: string | null;
  hint: string | null;
  due_in_sleep_or_wind_down: boolean;
};

function formatPlanRange(startStr: string, endStr: string, zone: string) {
  const s = parseApiTimestamp(startStr, zone);
  const e = parseApiTimestamp(endStr, zone);
  if (!s || !e) return '';
  return `${s.toFormat('ccc, LLL d • h:mm a')} – ${e.toFormat('h:mm a')}`;
}

const TaskEditModal = ({ task, mode = 'edit', onClose, onSave, onDelete }: TaskEditModalProps) => {
  const { user, token } = useAuth();
  const zone = effectiveTimeZone(user?.timezone);
  const [formData, setFormData] = useState<Task>(task);
  const [showAdditional, setShowAdditional] = useState<boolean>(() =>
    Boolean(task.planned_datetime || (task.estimated_minutes && task.estimated_minutes > 0))
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planSuggestion, setPlanSuggestion] = useState<PlanSuggestionResponse | null>(null);
  const [planSuggestLoading, setPlanSuggestLoading] = useState(false);

  const handleChange = (field: keyof Task, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const minutesForSuggestion = formData.due_datetime
    ? Math.max(15, formData.estimated_minutes > 0 ? formData.estimated_minutes : 60)
    : 0;
  const usingDefaultDurationForSuggestion = Boolean(
    formData.due_datetime && (!formData.estimated_minutes || formData.estimated_minutes < 15),
  );

  useEffect(() => {
    if (!token || !formData.due_datetime || minutesForSuggestion < 15) {
      setPlanSuggestion(null);
      setPlanSuggestLoading(false);
      return;
    }
    const due = formData.due_datetime;
    const est = minutesForSuggestion;
    let cancelled = false;
    setPlanSuggestLoading(true);
    setPlanSuggestion(null);
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ due_datetime: due, estimated_minutes: String(est) });
          const data = await apiJson<PlanSuggestionResponse>(`/api/me/tasks/suggest-plan?${params}`, { token });
          if (!cancelled) setPlanSuggestion(data);
        } catch {
          if (!cancelled) setPlanSuggestion(null);
        } finally {
          if (!cancelled) setPlanSuggestLoading(false);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      setPlanSuggestLoading(false);
    };
  }, [token, formData.due_datetime, minutesForSuggestion]);

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

  const toDateValue = (value?: string) => {
    const dt = parseApiTimestamp(value, zone);
    return dt ? dt.toFormat('yyyy-MM-dd') : '';
  };
  const toTimeValue = (value?: string) => {
    const dt = parseApiTimestamp(value, zone);
    return dt ? dt.toFormat('HH:mm') : '';
  };
  const setDueFromDateAndTime = (date: string, time: string) => {
    // Allow users to set date first then time (and vice versa).
    // Only explicit clears (empty string from an input) or the Clear button should clear the field.
    if (!date && !time) {
      handleChange('due_datetime', undefined);
      return;
    }
    const existingDate = toDateValue(formData.due_datetime);
    const existingTime = toTimeValue(formData.due_datetime);
    const d = date || existingDate || DateTime.now().setZone(zone).toFormat('yyyy-MM-dd');
    const t = time || existingTime || '00:00';
    const [hh, mm] = t.split(':').map((x) => parseInt(x, 10));
    const [y, mo, da] = d.split('-').map((x) => parseInt(x, 10));
    const dt = DateTime.fromObject({ year: y, month: mo, day: da, hour: hh || 0, minute: mm || 0, second: 0 }, { zone });
    handleChange('due_datetime', dt.isValid ? dt.toFormat('yyyy-MM-dd HH:mm:ss') : undefined);
  };
  const setPlannedFromDateAndTime = (date: string, time: string) => {
    // Allow users to set date first then time (and vice versa).
    if (!date && !time) {
      handleChange('planned_datetime', undefined);
      return;
    }
    const existingDate = toDateValue(formData.planned_datetime);
    const existingTime = toTimeValue(formData.planned_datetime);
    const d = date || existingDate || DateTime.now().setZone(zone).toFormat('yyyy-MM-dd');
    const t = time || existingTime || '00:00';
    const [hh, mm] = t.split(':').map((x) => parseInt(x, 10));
    const [y, mo, da] = d.split('-').map((x) => parseInt(x, 10));
    const dt = DateTime.fromObject({ year: y, month: mo, day: da, hour: hh || 0, minute: mm || 0, second: 0 }, { zone });
    handleChange('planned_datetime', dt.isValid ? dt.toFormat('yyyy-MM-dd HH:mm:ss') : undefined);
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
                  value={Math.min(3, Math.max(1, 4 - (Number(formData.priority) || 3)))}
                  onChange={(e) => handleChange('priority', 4 - Number.parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value={1}>1 — Low</option>
                  <option value={2}>2 — Medium</option>
                  <option value={3}>3 — High</option>
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
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) handleChange('due_datetime', undefined);
                    else setDueFromDateAndTime(v, toTimeValue(formData.due_datetime));
                  }}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <input
                  type="time"
                  step={900}
                  value={toTimeValue(formData.due_datetime)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) handleChange('due_datetime', undefined);
                    else setDueFromDateAndTime(toDateValue(formData.due_datetime), v);
                  }}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
                {formData.due_datetime ? (
                  <button
                    type="button"
                    onClick={() => handleChange('due_datetime', undefined)}
                    className="px-3 py-2 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm font-medium"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {!planSuggestLoading && planSuggestion?.due_in_sleep_or_wind_down ? (
                <p className="text-xs text-muted-foreground mt-1">Due falls during sleep or wind-down.</p>
              ) : null}
              {formData.due_datetime &&
              (planSuggestLoading ||
                planSuggestion?.hint ||
                (planSuggestion?.suggested_planned_datetime && planSuggestion?.suggested_block_end)) ? (
                <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 mt-2 space-y-2">
                  {planSuggestLoading ? (
                    <p className="text-xs text-muted-foreground">Finding a time to work before this deadline…</p>
                  ) : planSuggestion?.suggested_planned_datetime && planSuggestion.suggested_block_end ? (
                    <>
                      <p className="text-xs text-foreground">
                        <span className="font-medium">Suggested work block</span> before your due time (avoids sleep & wind-down):
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatPlanRange(
                          planSuggestion.suggested_planned_datetime,
                          planSuggestion.suggested_block_end,
                          zone,
                        )}
                      </p>
                      {usingDefaultDurationForSuggestion ? (
                        <p className="text-[11px] text-muted-foreground">
                          Assuming {minutesForSuggestion} minutes — adjust under Additional options if needed.
                        </p>
                      ) : null}
                      <button
                        type="button"
                        className="text-xs font-medium text-accent hover:underline"
                        onClick={() => {
                          setShowAdditional(true);
                          handleChange('planned_datetime', planSuggestion.suggested_planned_datetime!);
                        }}
                      >
                        Use this planned time
                      </button>
                    </>
                  ) : planSuggestion?.hint ? (
                    <p className="text-xs text-muted-foreground">{planSuggestion.hint}</p>
                  ) : null}
                </div>
              ) : null}
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
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) handleChange('planned_datetime', undefined);
                        else setPlannedFromDateAndTime(v, toTimeValue(formData.planned_datetime));
                      }}
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <input
                      type="time"
                      step={900}
                      value={toTimeValue(formData.planned_datetime)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) handleChange('planned_datetime', undefined);
                        else setPlannedFromDateAndTime(toDateValue(formData.planned_datetime), v);
                      }}
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    {formData.planned_datetime ? (
                      <button
                        type="button"
                        onClick={() => handleChange('planned_datetime', undefined)}
                        className="px-3 py-2 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm font-medium"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    When you plan to work on this. Adds to your calendar. Cannot overlap sleep or wind-down (your sleep goal). Times use your profile timezone
                    {zone ? ` (${zone})` : ''}.
                  </p>
                </div>

                {/* Estimated duration */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">
                    Estimated duration
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground">Hours</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="24"
                        value={Math.floor((formData.estimated_minutes || 0) / 60) || ''}
                        onChange={(e) => {
                          const nextH = Math.max(0, parseInt(e.target.value, 10) || 0);
                          const currentM = Math.max(0, (formData.estimated_minutes || 0) % 60);
                          handleChange('estimated_minutes', nextH * 60 + currentM);
                        }}
                        onWheel={blurNumberInputOnWheel}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                        placeholder="e.g. 1"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground">Minutes</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="59"
                        step="5"
                        value={(formData.estimated_minutes || 0) % 60 || ''}
                        onChange={(e) => {
                          const nextMRaw = parseInt(e.target.value, 10) || 0;
                          const nextM = Math.min(59, Math.max(0, nextMRaw));
                          const currentH = Math.max(0, Math.floor((formData.estimated_minutes || 0) / 60));
                          handleChange('estimated_minutes', currentH * 60 + nextM);
                        }}
                        onWheel={blurNumberInputOnWheel}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                        placeholder="e.g. 30"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Used for the suggested work block.</p>
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
                            onWheel={blurNumberInputOnWheel}
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
