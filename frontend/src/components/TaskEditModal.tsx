import { CalendarDays, CheckSquare, ChevronDown, ChevronRight } from 'lucide-react';
import { ApiError, apiJson } from '@/lib/api';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
const DATE_ONLY_DUE_SENTINEL = '23:59:59';

const SELECT_FIELD =
  'h-9 w-full rounded-md border border-input bg-background px-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

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

function isDateOnlyDueDatetime(value?: string) {
  if (!value) return false;
  const normalized = String(value).trim().replace('T', ' ');
  return normalized.endsWith(DATE_ONLY_DUE_SENTINEL);
}

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
  /** User chose to schedule work on the calendar, or task already has a planned time / duration. */
  const [scheduleSectionActive, setScheduleSectionActive] = useState<boolean>(() =>
    Boolean(task.planned_datetime || (task.estimated_minutes && task.estimated_minutes > 0)),
  );
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planSuggestion, setPlanSuggestion] = useState<PlanSuggestionResponse | null>(null);
  const [planSuggestLoading, setPlanSuggestLoading] = useState(false);

  const handleChange = (field: keyof Task, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const dueHasExplicitTime = Boolean(formData.due_datetime && !isDateOnlyDueDatetime(formData.due_datetime));
  const minutesForSuggestion = dueHasExplicitTime
    ? Math.max(15, formData.estimated_minutes > 0 ? formData.estimated_minutes : 60)
    : 0;
  const usingDefaultDurationForSuggestion = Boolean(
    dueHasExplicitTime && (!formData.estimated_minutes || formData.estimated_minutes < 15),
  );

  useEffect(() => {
    if (!token || !formData.due_datetime || !dueHasExplicitTime || minutesForSuggestion < 15) {
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
  }, [token, formData.due_datetime, dueHasExplicitTime, minutesForSuggestion]);

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
        planned_datetime: scheduleSectionActive ? formData.planned_datetime : undefined,
        estimated_minutes: scheduleSectionActive ? (formData.estimated_minutes || 0) : 0,
        category: formData.category || undefined,
      };
      if (!scheduleSectionActive) {
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
  const toTimeValue = (value?: string, blankForDateOnly = false) => {
    if (blankForDateOnly && isDateOnlyDueDatetime(value)) return '';
    const dt = parseApiTimestamp(value, zone);
    return dt ? dt.toFormat('HH:mm') : '';
  };
  const setDueFromDateAndTime = (date: string, time: string) => {
    if (!date && !time) {
      handleChange('due_datetime', undefined);
      return;
    }
    const existingDate = toDateValue(formData.due_datetime);
    const d = date || existingDate || DateTime.now().setZone(zone).toFormat('yyyy-MM-dd');
    if (!d) {
      handleChange('due_datetime', undefined);
      return;
    }
    if (!time) {
      handleChange('due_datetime', `${d} ${DATE_ONLY_DUE_SENTINEL}`);
      return;
    }
    const [hh, mm] = time.split(':').map((x) => parseInt(x, 10));
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

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[min(92vh,760px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4" />
            {mode === 'create' ? 'Add task' : 'Edit task'}
          </DialogTitle>
          <DialogDescription>
            All times are saved in your profile timezone:{' '}
            <span className="font-medium text-foreground">{zone}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="task-title" className="text-xs font-medium text-foreground">
              Title
            </label>
            <Input
              id="task-title"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="e.g. Finish homework"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="task-priority" className="text-xs font-medium text-foreground">
                Priority
              </label>
              <select
                id="task-priority"
                value={Math.min(3, Math.max(1, 4 - (Number(formData.priority) || 3)))}
                onChange={(e) => handleChange('priority', 4 - Number.parseInt(e.target.value, 10))}
                className={SELECT_FIELD}
              >
                <option value={1}>1 — Low</option>
                <option value={2}>2 — Medium</option>
                <option value={3}>3 — High</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="task-category" className="text-xs font-medium text-foreground">
                Category (optional)
              </label>
              <select
                id="task-category"
                value={formData.category || ''}
                onChange={(e) => handleChange('category', e.target.value || undefined)}
                className={SELECT_FIELD}
              >
                <option value="">No category</option>
                {TASK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border/50 bg-muted/30 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[140px] flex-1 space-y-1">
                <label htmlFor="task-due-date" className="text-xs font-medium text-foreground">
                  Due date
                </label>
                <Input
                  id="task-due-date"
                  type="date"
                  value={toDateValue(formData.due_datetime)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) handleChange('due_datetime', undefined);
                    else setDueFromDateAndTime(v, toTimeValue(formData.due_datetime, true));
                  }}
                  className="h-10 max-w-[220px]"
                />
              </div>
              <div className="min-w-[120px] flex-1 space-y-1">
                <label htmlFor="task-due-time" className="text-xs font-medium text-foreground">
                  Due time
                </label>
                <Input
                  id="task-due-time"
                  type="time"
                  step={900}
                  value={toTimeValue(formData.due_datetime, true)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      const existingDate = toDateValue(formData.due_datetime);
                      if (!existingDate) handleChange('due_datetime', undefined);
                      else setDueFromDateAndTime(existingDate, '');
                    } else setDueFromDateAndTime(toDateValue(formData.due_datetime), v);
                  }}
                  className="h-10"
                />
              </div>
              {formData.due_datetime ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => handleChange('due_datetime', undefined)}
                >
                  Clear
                </Button>
              ) : null}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Optional — set a deadline or leave blank. Deadlines show on your calendar at the due time.
            </p>
            {formData.due_datetime && !dueHasExplicitTime ? (
              <p className="text-[10px] text-muted-foreground">
                No due time set. This task will be treated as due by the end of that day.
              </p>
            ) : null}
            {!planSuggestLoading && planSuggestion?.due_in_sleep_or_wind_down ? (
              <p className="text-xs text-muted-foreground">Due falls during sleep or wind-down.</p>
            ) : null}
            {formData.due_datetime &&
            (planSuggestLoading ||
              planSuggestion?.hint ||
              (planSuggestion?.suggested_planned_datetime && planSuggestion?.suggested_block_end)) ? (
              <div className="space-y-2 rounded-md border border-border/40 bg-background/80 px-2 py-1.5">
                {planSuggestLoading ? (
                  <p className="text-xs text-muted-foreground">Finding a time to work before this deadline…</p>
                ) : planSuggestion?.suggested_planned_datetime && planSuggestion.suggested_block_end ? (
                  <>
                    <p className="text-xs text-foreground">
                      <span className="font-medium">Suggested work block</span> before your due time (avoids sleep &
                      wind-down):
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPlanRange(
                        planSuggestion.suggested_planned_datetime,
                        planSuggestion.suggested_block_end,
                        zone,
                      )}
                    </p>
                    {usingDefaultDurationForSuggestion ? (
                      <p className="text-[10px] text-muted-foreground">
                        Assuming {minutesForSuggestion} minutes — adjust duration after you open{' '}
                        <span className="font-medium text-foreground">Schedule on calendar</span>.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="text-xs font-medium text-accent hover:underline"
                      onClick={() => {
                        setScheduleSectionActive(true);
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

          {!scheduleSectionActive ? (
            <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Want to block time to work on this before it is due? Add a <span className="font-medium text-foreground">planned</span>{' '}
                work slot—it shows as a separate block on your calendar from the deadline above.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 sm:w-auto"
                onClick={() => setScheduleSectionActive(true)}
              >
                <CalendarDays className="h-4 w-4" />
                Schedule on calendar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-foreground">Pick a time to work</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto shrink-0 px-2 py-1 text-[10px] text-muted-foreground"
                  onClick={() => {
                    setScheduleSectionActive(false);
                    handleChange('planned_datetime', undefined);
                    handleChange('estimated_minutes', 0);
                  }}
                >
                  Remove from calendar
                </Button>
              </div>
              <div className="space-y-3 rounded-lg border border-border/50 bg-muted/30 p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[140px] flex-1 space-y-1">
                    <label htmlFor="task-planned-date" className="text-xs font-medium text-foreground">
                      Work date
                    </label>
                    <Input
                      id="task-planned-date"
                      type="date"
                      value={toDateValue(formData.planned_datetime)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) handleChange('planned_datetime', undefined);
                        else setPlannedFromDateAndTime(v, toTimeValue(formData.planned_datetime));
                      }}
                      className="h-10 max-w-[220px]"
                    />
                  </div>
                  <div className="min-w-[120px] flex-1 space-y-1">
                    <label htmlFor="task-planned-time" className="text-xs font-medium text-foreground">
                      Start time
                    </label>
                    <Input
                      id="task-planned-time"
                      type="time"
                      step={900}
                      value={toTimeValue(formData.planned_datetime)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) handleChange('planned_datetime', undefined);
                        else setPlannedFromDateAndTime(toDateValue(formData.planned_datetime), v);
                      }}
                      className="h-10"
                    />
                  </div>
                  {formData.planned_datetime ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => handleChange('planned_datetime', undefined)}
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Shown as a &quot;Planned&quot; task block. Cannot overlap sleep or wind-down (your sleep goal).
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">How long you plan to work</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="task-est-hours" className="text-[10px] text-muted-foreground">
                      Hours
                    </label>
                    <Input
                      id="task-est-hours"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={24}
                      value={Math.floor((formData.estimated_minutes || 0) / 60) || ''}
                      onChange={(e) => {
                        const nextH = Math.max(0, parseInt(e.target.value, 10) || 0);
                        const currentM = Math.max(0, (formData.estimated_minutes || 0) % 60);
                        handleChange('estimated_minutes', nextH * 60 + currentM);
                      }}
                      onWheel={blurNumberInputOnWheel}
                      className="h-9"
                      placeholder="e.g. 1"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="task-est-min" className="text-[10px] text-muted-foreground">
                      Minutes
                    </label>
                    <Input
                      id="task-est-min"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={59}
                      step={5}
                      value={(formData.estimated_minutes || 0) % 60 || ''}
                      onChange={(e) => {
                        const nextMRaw = parseInt(e.target.value, 10) || 0;
                        const nextM = Math.min(59, Math.max(0, nextMRaw));
                        const currentH = Math.max(0, Math.floor((formData.estimated_minutes || 0) / 60));
                        handleChange('estimated_minutes', currentH * 60 + nextM);
                      }}
                      onWheel={blurNumberInputOnWheel}
                      className="h-9"
                      placeholder="e.g. 30"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">Sets the length of the planned block and improves deadline suggestions.</p>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="task-notes" className="text-xs font-medium text-foreground">
              Notes (optional)
            </label>
            <Textarea
              id="task-notes"
              value={formData.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              className="min-h-[90px]"
              placeholder="Notes…"
            />
          </div>

          <Collapsible open={moreOptionsOpen} onOpenChange={setMoreOptionsOpen}>
            <CollapsibleTrigger className="flex w-full items-center gap-2 py-2 text-xs font-medium text-foreground hover:text-accent transition-colors">
              {moreOptionsOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              More options
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              {mode === 'create' ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-1">
                    <label htmlFor="task-repeat" className="text-[10px] text-muted-foreground">
                      Repeat
                    </label>
                    <select
                      id="task-repeat"
                      value={formData.repeat || 'none'}
                      onChange={(e) => handleChange('repeat', e.target.value as Task['repeat'])}
                      className={SELECT_FIELD}
                    >
                      <option value="none">Does not repeat</option>
                      <option value="daily">Daily</option>
                      <option value="weekdays">Weekdays</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="task-repeat-count" className="text-[10px] text-muted-foreground">
                      Occurrences
                    </label>
                    <Input
                      id="task-repeat-count"
                      type="number"
                      min={1}
                      max={365}
                      value={formData.repeat_count || 5}
                      onChange={(e) => handleChange('repeat_count', parseInt(e.target.value, 10) || 1)}
                      onWheel={blurNumberInputOnWheel}
                      disabled={(formData.repeat || 'none') === 'none' || Boolean(formData.repeat_until)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="task-repeat-until" className="text-[10px] text-muted-foreground">
                      Repeat until
                    </label>
                    <Input
                      id="task-repeat-until"
                      type="date"
                      value={formData.repeat_until || ''}
                      onChange={(e) => handleChange('repeat_until', e.target.value || undefined)}
                      disabled={(formData.repeat || 'none') === 'none'}
                      className="h-9"
                    />
                  </div>
                </div>
              ) : null}

              {mode === 'edit' ? (
                <div className="space-y-1">
                  <label htmlFor="task-status" className="text-xs font-medium text-foreground">
                    Status
                  </label>
                  <select
                    id="task-status"
                    value={formData.status}
                    onChange={(e) => handleChange('status', e.target.value)}
                    className={SELECT_FIELD}
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              ) : null}

              {mode === 'edit' && formData.recurrence_series_id ? (
                <div className="space-y-1">
                  <label htmlFor="task-edit-scope" className="text-xs font-medium text-foreground">
                    Apply changes to
                  </label>
                  <select
                    id="task-edit-scope"
                    value={formData.edit_scope || 'single'}
                    onChange={(e) => handleChange('edit_scope', e.target.value as Task['edit_scope'])}
                    className={SELECT_FIELD}
                  >
                    <option value="single">Only this task</option>
                    <option value="series">All tasks in this series</option>
                  </select>
                </div>
              ) : null}
            </CollapsibleContent>
          </Collapsible>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between sm:space-x-0">
          {mode === 'edit' && onDelete ? (
            <Button
              type="button"
              variant="outline"
              className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 sm:mr-auto sm:w-auto"
              onClick={handleDelete}
              disabled={deleting || saving}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          ) : (
            <span className="hidden sm:block sm:flex-1" aria-hidden />
          )}
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving || deleting} className="sm:min-w-[5rem]">
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving || deleting} className="sm:min-w-[5rem]">
              {saving ? (mode === 'create' ? 'Adding…' : 'Saving…') : mode === 'create' ? 'Add' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TaskEditModal;



