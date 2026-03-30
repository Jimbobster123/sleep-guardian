import express from 'express';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { parseIcs } from '../import/ics.js';
import { buildScheduleSuggestions } from '../schedule/suggestions.js';
import { getProfilePhotoUrl, saveProfilePhoto } from '../profilePhotos.js';
import {
  createOrUpdateSleepGoal,
  createTask,
  deleteTask,
  deleteTasksBySeriesId,
  createCalendarEvent,
  deleteCalendarEvent,
  getConflictingCalendarEvents,
  getCalendarEvents,
  getCalendarEventById,
  getActiveSleepGoal,
  getSleepWindows,
  getTaskById,
  getTasksBySeriesId,
  getUserTasks,
  getCalendarEventsBySeriesId,
  updateCalendarEvent,
  updateTask,
  updateTaskStatus,
  getBedtimeReminderSettings,
  upsertBedtimeReminderSettings,
  updateUserProfile,
  deleteTaskCalendarEvents,
  upsertImportedCalendarEvent,
  upsertSleepWindow,
  upsertTaskCalendarEvent,
} from '../queries.js';
import { pushLocalEventToGoogle, deleteGoogleEventForLocal } from '../google/calendar.js';

const router = express.Router();
const TEXT_REMINDERS_AVAILABLE = false;

const VALID_GOAL_TYPES = new Set(['fixed_bedtime', 'fixed_wake_time', 'fixed_duration']);

function isValidTimeString(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(value);
}

function isNullableTimeString(value) {
  return value === null || value === undefined || isValidTimeString(value);
}

const REPEAT_TYPES = new Set(['none', 'daily', 'weekdays', 'weekly']);

function parseDateInput(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toPgTimestampLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function parsePositiveInt(value, fallback = 1) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function expandRecurrence({ start, end, repeat, repeat_until, repeat_count }) {
  if (!start || !end) return [{ start, end }];
  const type = typeof repeat === 'string' ? repeat : 'none';
  if (!REPEAT_TYPES.has(type) || type === 'none') return [{ start, end }];

  const instances = [];
  const maxCount = Math.min(parsePositiveInt(repeat_count, 1), 365);
  const until = parseDateInput(repeat_until);
  const durationMs = end.getTime() - start.getTime();
  if (durationMs <= 0) return [];

  let current = new Date(start);
  while (instances.length < maxCount) {
    const currentEnd = new Date(current.getTime() + durationMs);
    if (until && current > until) break;
    if (type !== 'weekdays' || (current.getDay() !== 0 && current.getDay() !== 6)) {
      instances.push({ start: new Date(current), end: currentEnd });
    }
    if (type === 'daily' || type === 'weekdays') current.setDate(current.getDate() + 1);
    else current.setDate(current.getDate() + 7);
    if (!until && instances.length >= maxCount) break;
    if (until && instances.length >= 365) break;
  }
  return instances;
}

function overlapsRange(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function buildSleepRangesForDate(date, windows, goal, windDownMinutes) {
  const dow = date.getDay();
  const selected = windows.find((w) => Number(w.day_of_week) === dow);
  const bed = String(selected?.start_time || goal?.target_bedtime || '23:00:00').slice(0, 5);
  const wake = String(selected?.end_time || goal?.target_wake_time || '07:00:00').slice(0, 5);
  const [bh, bm] = bed.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  const bedAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), bh || 23, bm || 0, 0, 0);
  const wakeAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), wh || 7, wm || 0, 0, 0);
  const sleepEnd = wakeAt <= bedAt ? new Date(wakeAt.getTime() + 24 * 60 * 60 * 1000) : wakeAt;
  const windDownStart = new Date(bedAt.getTime() - windDownMinutes * 60 * 1000);
  return { windDownStart, bedAt, sleepEnd };
}

async function validateAgainstSleepAndWindDown(userId, start, end) {
  const goal = await getActiveSleepGoal(userId);
  const windows = goal ? await getSleepWindows(goal.sleep_goal_id) : [];
  const windDownMinutes = Math.max(15, Number(goal?.bedtime_flex_minutes || 60));

  // Check every sleep/wind-down episode that could touch this interval (not just
  // start/end calendar days — e.g. Sun 2am work must still catch Sat-bed → Sun wake).
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1, 12, 0, 0, 0);
  const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1, 12, 0, 0, 0);
  while (cursor.getTime() <= lastDay.getTime()) {
    const d = new Date(cursor);
    const { windDownStart, bedAt, sleepEnd } = buildSleepRangesForDate(d, windows, goal, windDownMinutes);
    if (overlapsRange(start, end, windDownStart, bedAt)) {
      return { ok: false, code: 'wind_down_conflict', message: 'This time overlaps your wind-down period before bedtime.' };
    }
    if (overlapsRange(start, end, bedAt, sleepEnd)) {
      return { ok: false, code: 'sleep_conflict', message: 'This time overlaps your sleep window.' };
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return { ok: true };
}

/**
 * Find a [start, end] work block ending at or before `due`, outside sleep/wind-down,
 * with start not much before now. Steps backward in 15m increments.
 */
async function suggestTaskWorkSlotBeforeDue(userId, due, durationMinutes) {
  let dueInSleepOrWindDown = false;
  if (due) {
    const probe = await validateAgainstSleepAndWindDown(userId, due, new Date(due.getTime() + 60 * 1000));
    dueInSleepOrWindDown = !probe.ok;
  }

  if (!due || !Number.isFinite(durationMinutes) || durationMinutes < 15) {
    return {
      suggested_planned_datetime: null,
      suggested_block_end: null,
      hint:
        durationMinutes > 0 && durationMinutes < 15
          ? 'Use an estimate of at least 15 minutes to get a suggested work time.'
          : null,
      due_in_sleep_or_wind_down: dueInSleepOrWindDown,
    };
  }

  const durMs = durationMinutes * 60 * 1000;
  const stepMs = 15 * 60 * 1000;
  const nowMs = Date.now();
  const slackMs = 60_000;
  const maxLookbackMs = 14 * 24 * 60 * 60 * 1000;

  if (due.getTime() < nowMs + durMs - slackMs) {
    return {
      suggested_planned_datetime: null,
      suggested_block_end: null,
      hint: 'That deadline is too soon for this duration starting from now.',
      due_in_sleep_or_wind_down: dueInSleepOrWindDown,
    };
  }

  let end = new Date(due.getTime());
  const floorEnd = new Date(due.getTime() - maxLookbackMs);

  while (end.getTime() >= floorEnd.getTime()) {
    const start = new Date(end.getTime() - durMs);
    if (start.getTime() < nowMs - slackMs) {
      break;
    }
    const v = await validateAgainstSleepAndWindDown(userId, start, end);
    if (v.ok) {
      return {
        suggested_planned_datetime: toPgTimestampLocal(start),
        suggested_block_end: toPgTimestampLocal(end),
        hint: null,
        due_in_sleep_or_wind_down: dueInSleepOrWindDown,
      };
    }
    end = new Date(end.getTime() - stepMs);
  }

  return {
    suggested_planned_datetime: null,
    suggested_block_end: null,
    hint: 'Could not find a slot before this deadline outside sleep and wind-down. Try a later due, a shorter estimate, or pick a planned time manually.',
    due_in_sleep_or_wind_down: dueInSleepOrWindDown,
  };
}

async function validateSchedule({ userId, start, end, excludeEventId, excludeTaskId }) {
  const conflicts = await getConflictingCalendarEvents(userId, { start, end, excludeEventId, excludeTaskId });
  if (conflicts.length) {
    return {
      ok: false,
      code: 'calendar_conflict',
      message: 'This time overlaps with an existing event.',
      details: conflicts.slice(0, 3),
    };
  }
  return validateAgainstSleepAndWindDown(userId, start, end);
}

router.get('/', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { email, first_name, last_name, phone_number, timezone } = req.body || {};
    const user = await updateUserProfile(req.user.user_id, { email, first_name, last_name, phone_number, timezone });
    res.json({ user });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    res.status(500).json({ error: 'Failed to update profile', details: err.message });
  }
});

router.get('/bedtime-reminder', requireAuth, async (req, res) => {
  try {
    const settings = await getBedtimeReminderSettings(req.user.user_id);
    if (!settings) return res.status(404).json({ error: 'User not found' });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bedtime reminder settings', details: err.message });
  }
});

router.get('/profile-photo', requireAuth, async (req, res) => {
  try {
    const photo_url = await getProfilePhotoUrl(req.user.user_id);
    res.json({ photo_url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile photo', details: err.message });
  }
});

router.put('/profile-photo', requireAuth, async (req, res) => {
  try {
    const imageDataUrl = typeof req.body?.imageDataUrl === 'string' ? req.body.imageDataUrl : '';
    if (!imageDataUrl) {
      return res.status(400).json({ error: 'imageDataUrl is required' });
    }

    const photo_url = await saveProfilePhoto(req.user.user_id, imageDataUrl);
    res.json({ photo_url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save profile photo', details: err.message });
  }
});

router.put('/bedtime-reminder', requireAuth, async (req, res) => {
  try {
    const existingSettings = await getBedtimeReminderSettings(req.user.user_id);
    const {
      email,
      phone_number,
      method,
      minutes_before_bedtime,
      enabled,
    } = req.body || {};

    const normalizedMethod = typeof method === 'string' ? method.trim().toLowerCase() : 'email';
    if (!['email', 'text_message'].includes(normalizedMethod)) {
      return res.status(400).json({ error: 'method must be email or text_message' });
    }
    if (normalizedMethod === 'text_message' && !TEXT_REMINDERS_AVAILABLE) {
      return res.status(400).json({ error: 'Text message reminders are not available yet. Please use email for now.' });
    }

    const minutes = Math.round(Number(minutes_before_bedtime));
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) {
      return res.status(400).json({ error: 'minutes_before_bedtime must be between 0 and 1440' });
    }

    const normalizedEmail =
      typeof email === 'string'
        ? email.trim()
        : String(existingSettings?.email || req.user.email || '').trim();
    const normalizedPhone =
      typeof phone_number === 'string'
        ? phone_number.trim()
        : String(existingSettings?.phone_number || req.user.phone_number || '').trim();
    const isEnabled = Boolean(enabled);

    if (isEnabled && normalizedMethod === 'email' && !normalizedEmail) {
      return res.status(400).json({ error: 'An email address is required for email reminders' });
    }

    if (isEnabled && normalizedMethod === 'text_message' && !normalizedPhone) {
      return res.status(400).json({ error: 'A phone number is required for text reminders' });
    }

    const settings = await upsertBedtimeReminderSettings(req.user.user_id, {
      email: normalizedEmail,
      phone_number: normalizedPhone,
      method: normalizedMethod,
      minutes_before_bedtime: minutes,
      enabled: isEnabled,
    });

    res.json(settings);
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    res.status(500).json({ error: 'Failed to update bedtime reminder settings', details: err.message });
  }
});

router.get('/sleep-goal', requireAuth, async (req, res) => {
  try {
    const goal = await getActiveSleepGoal(req.user.user_id);
    const windows = goal ? await getSleepWindows(goal.sleep_goal_id) : [];
    res.json({ goal, windows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sleep goal', details: err.message });
  }
});

router.put('/sleep-goal', requireAuth, async (req, res) => {
  try {
    const { goal_type, target_sleep_minutes, target_bedtime, target_wake_time, bedtime_flex_minutes, windows } = req.body || {};
    if (typeof goal_type !== 'string' || !VALID_GOAL_TYPES.has(goal_type)) {
      return res.status(400).json({ error: 'goal_type must be one of fixed_bedtime, fixed_wake_time, or fixed_duration' });
    }

    if (!isNullableTimeString(target_bedtime)) {
      return res.status(400).json({ error: 'target_bedtime must use HH:MM:SS format or be null' });
    }

    if (!isNullableTimeString(target_wake_time)) {
      return res.status(400).json({ error: 'target_wake_time must use HH:MM:SS format or be null' });
    }

    if (!Number.isInteger(bedtime_flex_minutes) || bedtime_flex_minutes < 0) {
      return res.status(400).json({ error: 'bedtime_flex_minutes must be a whole number greater than or equal to 0' });
    }

    if (goal_type === 'fixed_duration') {
      if (!Number.isInteger(target_sleep_minutes) || target_sleep_minutes <= 0) {
        return res.status(400).json({ error: 'target_sleep_minutes must be a whole number greater than 0 for fixed_duration' });
      }
    } else if (target_sleep_minutes !== null && target_sleep_minutes !== undefined) {
      return res.status(400).json({ error: 'target_sleep_minutes must be null unless goal_type is fixed_duration' });
    }

    if (!Array.isArray(windows) || windows.length === 0) {
      return res.status(400).json({ error: 'windows is required' });
    }

    for (const w of windows) {
      if (!w) return res.status(400).json({ error: 'Each sleep window is required' });
      const day = Number(w.day_of_week);
      if (!Number.isInteger(day) || day < 0 || day > 6) {
        return res.status(400).json({ error: 'Each sleep window day_of_week must be an integer from 0 to 6' });
      }
      if (!isValidTimeString(w.start_time) || !isValidTimeString(w.end_time)) {
        return res.status(400).json({ error: 'Each sleep window time must use HH:MM:SS format' });
      }
    }

    const goal = await createOrUpdateSleepGoal(req.user.user_id, {
      goal_type,
      target_sleep_minutes: target_sleep_minutes ?? null,
      target_bedtime: target_bedtime ?? null,
      target_wake_time: target_wake_time ?? null,
      bedtime_flex_minutes,
    });

    const upserted = [];
    if (Array.isArray(windows)) {
      for (const w of windows) {
        if (!w) continue;
        const day = Number(w.day_of_week);
        if (!Number.isInteger(day) || day < 0 || day > 6) continue;
        if (typeof w.start_time !== 'string' || typeof w.end_time !== 'string') continue;
        const row = await upsertSleepWindow(goal.sleep_goal_id, {
          day_of_week: day,
          start_time: w.start_time,
          end_time: w.end_time,
        });
        upserted.push(row);
      }
    }

    res.json({ goal, windows: upserted.length ? upserted : await getSleepWindows(goal.sleep_goal_id) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update sleep goal', details: err.message });
  }
});

router.get('/tasks', requireAuth, async (req, res) => {
  try {
    const tasks = await getUserTasks(req.user.user_id);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks', details: err.message });
  }
});

router.post('/tasks', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const repeat = typeof body.repeat === 'string' ? body.repeat : 'none';
    const repeatCount = body.repeat_until ? 365 : parsePositiveInt(body.repeat_count, 1);
    const basePlanned = parseDateInput(body.planned_datetime);
    const est = Number(body.estimated_minutes || 0);
    const baseDue = parseDateInput(body.due_datetime);

    const plannedInstances = basePlanned && est > 0
      ? expandRecurrence({
          start: basePlanned,
          end: new Date(basePlanned.getTime() + est * 60 * 1000),
          repeat,
          repeat_until: body.repeat_until,
          repeat_count: repeatCount,
        })
      : [{ start: null, end: null }];

    const seriesId = repeat !== 'none' && plannedInstances.length > 1 ? randomUUID() : null;
    const createdTasks = [];
    for (let i = 0; i < plannedInstances.length; i++) {
      const instance = plannedInstances[i];
      if (instance.start && instance.end) {
        const valid = await validateSchedule({
          userId: req.user.user_id,
          start: instance.start,
          end: instance.end,
        });
        if (!valid.ok) {
          return res.status(409).json({ error: valid.message, code: valid.code, details: valid.details || null });
        }
      }

      const taskPayload = {
        ...body,
        recurrence_series_id: seriesId,
        planned_datetime: instance.start ? toPgTimestampLocal(instance.start) : null,
        due_datetime:
          baseDue && basePlanned && instance.start
            ? toPgTimestampLocal(new Date(baseDue.getTime() + (instance.start.getTime() - basePlanned.getTime())))
            : body.due_datetime || null,
      };

      const created = await createTask(req.user.user_id, taskPayload);
      try {
        await upsertTaskCalendarEvent(req.user.user_id, created);
      } catch (calendarErr) {
        console.error('Calendar sync failed for task:', calendarErr);
      }
      createdTasks.push(created);
    }

    res.status(201).json(createdTasks.length === 1 ? createdTasks[0] : { tasks: createdTasks });
  } catch (err) {
    if (err instanceof Error && err.message === 'Title is required') {
      return res.status(400).json({ error: err.message });
    }
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Failed to create task', details: err.message });
  }
});

router.get('/tasks/suggest-plan', requireAuth, async (req, res) => {
  try {
    const rawDue = req.query?.due_datetime;
    const due = parseDateInput(typeof rawDue === 'string' ? rawDue : '');
    const minutes = parsePositiveInt(req.query?.estimated_minutes, 60);
    if (!due) {
      return res.status(400).json({ error: 'due_datetime query parameter is required' });
    }
    const out = await suggestTaskWorkSlotBeforeDue(req.user.user_id, due, minutes);
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'Failed to suggest plan', details: err.message });
  }
});

router.get('/tasks/:taskId', requireAuth, async (req, res) => {
  try {
    const task = await getTaskById(req.params.taskId);
    if (!task || task.user_id !== req.user.user_id) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch task', details: err.message });
  }
});

router.put('/tasks/:taskId', requireAuth, async (req, res) => {
  try {
    const scope = req.query.scope === 'series' ? 'series' : 'single';
    const existing = await getTaskById(req.params.taskId);
    if (!existing || existing.user_id !== req.user.user_id) return res.status(404).json({ error: 'Task not found' });

    if (scope === 'series') {
      if (!existing.recurrence_series_id) {
        return res.status(400).json({
          error:
            'This task is not linked to a recurring series. Run DB migration 006_recurrence_series.sql and recreate repeating tasks, or edit each task individually.',
        });
      }
      const seriesTasks = await getTasksBySeriesId(req.user.user_id, existing.recurrence_series_id);
      const nextPlanned = parseDateInput(req.body?.planned_datetime);
      const prevPlanned = parseDateInput(existing.planned_datetime);
      const plannedDelta = nextPlanned && prevPlanned ? nextPlanned.getTime() - prevPlanned.getTime() : 0;
      const nextDue = parseDateInput(req.body?.due_datetime);
      const prevDue = parseDateInput(existing.due_datetime);
      const dueDelta = nextDue && prevDue ? nextDue.getTime() - prevDue.getTime() : 0;

      const updatedTasks = [];
      for (const row of seriesTasks) {
        const rowPlanned = parseDateInput(row.planned_datetime);
        const rowDue = parseDateInput(row.due_datetime);
        const payload = {
          ...req.body,
          planned_datetime: rowPlanned && nextPlanned ? toPgTimestampLocal(new Date(rowPlanned.getTime() + plannedDelta)) : req.body?.planned_datetime,
          due_datetime: rowDue && nextDue ? toPgTimestampLocal(new Date(rowDue.getTime() + dueDelta)) : req.body?.due_datetime,
        };
        const updatedRow = await updateTask(row.task_id, payload);
        if (updatedRow) {
          updatedTasks.push(updatedRow);
          try {
            await upsertTaskCalendarEvent(req.user.user_id, updatedRow);
          } catch (calendarErr) {
            console.error('Calendar sync failed for task update:', calendarErr);
          }
        }
      }
      return res.json({ tasks: updatedTasks });
    }

    const updated = await updateTask(req.params.taskId, req.body || {});
    if (!updated || updated.user_id !== req.user.user_id) return res.status(404).json({ error: 'Task not found' });
    try {
      await upsertTaskCalendarEvent(req.user.user_id, updated);
    } catch (calendarErr) {
      console.error('Calendar sync failed for task update:', calendarErr);
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task', details: err.message });
  }
});

router.delete('/tasks/:taskId', requireAuth, async (req, res) => {
  try {
    const scope = req.query.scope === 'series' ? 'series' : 'single';
    const existing = await getTaskById(req.params.taskId);
    if (!existing || existing.user_id !== req.user.user_id) return res.status(404).json({ error: 'Task not found' });

    if (scope === 'series' && existing.recurrence_series_id) {
      const seriesTasks = await getTasksBySeriesId(req.user.user_id, existing.recurrence_series_id);
      for (const row of seriesTasks) {
        await deleteTaskCalendarEvents(req.user.user_id, row.task_id);
      }

      const deleted = await deleteTasksBySeriesId(req.user.user_id, existing.recurrence_series_id);
      return res.json({ ok: true, deleted_task_ids: deleted.map((t) => t.task_id) });
    }

    // Remove associated calendar blocks before deleting the task.
    // CalendarEvent rows keep source='task_planned'/'task_due', so delete them explicitly.
    await deleteTaskCalendarEvents(req.user.user_id, req.params.taskId);

    const deleted = await deleteTask(req.user.user_id, req.params.taskId);
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    res.json({ ok: true, deleted_task_ids: [deleted.task_id] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task', details: err.message });
  }
});

router.patch('/tasks/:taskId/status', requireAuth, async (req, res) => {
  try {
    const nextStatus = typeof req.body?.status === 'string' ? req.body.status : 'completed';
    const updated = await updateTaskStatus(req.params.taskId, req.user.user_id, nextStatus);
    if (!updated) return res.status(404).json({ error: 'Task not found' });
    try {
      await upsertTaskCalendarEvent(req.user.user_id, updated);
    } catch (calendarErr) {
      console.error('Calendar sync failed for task status update:', calendarErr);
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task status', details: err.message });
  }
});

router.get('/calendar-events', requireAuth, async (req, res) => {
  try {
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const events = await getCalendarEvents(req.user.user_id, { from, to });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch calendar events', details: err.message });
  }
});

router.post('/calendar-events', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const ignoreSleepValidation = Boolean(body.ignore_sleep_validation);
    const start = parseDateInput(body.start_datetime);
    const end = parseDateInput(body.end_datetime);
    if (!start || !end || end <= start) {
      return res.status(400).json({ error: 'start_datetime and end_datetime are required and end must be after start' });
    }
    const instances = expandRecurrence({
      start,
      end,
      repeat: body.repeat,
      repeat_until: body.repeat_until,
      repeat_count: body.repeat_until ? 365 : parsePositiveInt(body.repeat_count, 1),
    });

    const seriesId = body.repeat && body.repeat !== 'none' && instances.length > 1 ? randomUUID() : null;
    const createdEvents = [];
    for (const instance of instances) {
      if (!ignoreSleepValidation) {
        const valid = await validateSchedule({
          userId: req.user.user_id,
          start: instance.start,
          end: instance.end,
        });
        if (!valid.ok) {
          return res.status(409).json({ error: valid.message, code: valid.code, details: valid.details || null });
        }
      }
      const created = await createCalendarEvent(req.user.user_id, {
        ...body,
        recurrence_series_id: seriesId,
        start_datetime: toPgTimestampLocal(instance.start),
        end_datetime: toPgTimestampLocal(instance.end),
      });
      if (req.user.google_refresh_token) {
        void pushLocalEventToGoogle({ user: req.user, event: created });
      }
      createdEvents.push(created);
    }
    res.json(createdEvents.length === 1 ? createdEvents[0] : { events: createdEvents });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create calendar event', details: err.message });
  }
});

router.put('/calendar-events/:eventId', requireAuth, async (req, res) => {
  try {
    const scope = req.query.scope === 'series' ? 'series' : 'single';
    const existing = await getCalendarEventById(req.user.user_id, req.params.eventId);
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    if (scope === 'series' && existing.recurrence_series_id) {
      const seriesEvents = await getCalendarEventsBySeriesId(req.user.user_id, existing.recurrence_series_id);
      const nextStart = parseDateInput(req.body?.start_datetime);
      const prevStart = parseDateInput(existing.start_datetime);
      const startDelta = nextStart && prevStart ? nextStart.getTime() - prevStart.getTime() : 0;
      const nextEnd = parseDateInput(req.body?.end_datetime);
      const prevEnd = parseDateInput(existing.end_datetime);
      const endDelta = nextEnd && prevEnd ? nextEnd.getTime() - prevEnd.getTime() : 0;

      const updatedEvents = [];
      for (const row of seriesEvents) {
        const rowStart = parseDateInput(row.start_datetime);
        const rowEnd = parseDateInput(row.end_datetime);
        const payload = {
          ...req.body,
          start_datetime: rowStart && nextStart ? toPgTimestampLocal(new Date(rowStart.getTime() + startDelta)) : req.body?.start_datetime,
          end_datetime: rowEnd && nextEnd ? toPgTimestampLocal(new Date(rowEnd.getTime() + endDelta)) : req.body?.end_datetime,
        };
        const updatedRow = await updateCalendarEvent(req.user.user_id, row.event_id, payload);
        if (updatedRow) {
          updatedEvents.push(updatedRow);
          if (req.user.google_refresh_token) {
            void pushLocalEventToGoogle({ user: req.user, event: updatedRow });
          }
        }
      }
      return res.json({ events: updatedEvents });
    }

    const updated = await updateCalendarEvent(req.user.user_id, req.params.eventId, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Event not found' });
    if (req.user.google_refresh_token) {
      void pushLocalEventToGoogle({ user: req.user, event: updated });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update calendar event', details: err.message });
  }
});

router.delete('/calendar-events/:eventId', requireAuth, async (req, res) => {
  try {
    const scope = req.query.scope === 'series' ? 'series' : 'single';
    const existing = await getCalendarEventById(req.user.user_id, req.params.eventId);
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    if (scope === 'series' && existing.recurrence_series_id) {
      const series = await getCalendarEventsBySeriesId(req.user.user_id, existing.recurrence_series_id);
      const deletedIds = [];
      for (const row of series) {
        const deleted = await deleteCalendarEvent(req.user.user_id, row.event_id);
        if (deleted) {
          deletedIds.push(row.event_id);
          if (req.user.google_refresh_token) {
            void deleteGoogleEventForLocal({ user: req.user, event: row });
          }
        }
      }
      return res.json({ ok: true, deleted_event_ids: deletedIds });
    }

    const deleted = await deleteCalendarEvent(req.user.user_id, req.params.eventId);
    if (!deleted) return res.status(404).json({ error: 'Event not found' });
    if (req.user.google_refresh_token) {
      void deleteGoogleEventForLocal({ user: req.user, event: existing });
    }
    res.json({ ok: true, deleted_event_ids: [existing.event_id] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete calendar event', details: err.message });
  }
});

router.post('/calendar-import/ics', requireAuth, express.text({ type: '*/*', limit: '5mb' }), async (req, res) => {
  try {
    const events = parseIcs(req.body);
    const imported = [];
    for (const e of events) {
      const row = await upsertImportedCalendarEvent(req.user.user_id, e);
      imported.push(row);
    }
    res.json({ imported: imported.length });
  } catch (err) {
    res.status(500).json({ error: 'ICS import failed', details: err.message });
  }
});

router.post('/schedule/suggestions', requireAuth, async (req, res) => {
  try {
    const { date, proposed_event } = req.body || {};
    const result = await buildScheduleSuggestions({
      userId: req.user.user_id,
      date,
      proposedEvent: proposed_event ? { start_datetime: proposed_event.start_datetime, end_datetime: proposed_event.end_datetime } : null,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to build suggestions', details: err.message });
  }
});

// Apply a suggested sleep window (updates SleepWindow table).
// Optionally includes a proposed event time so the shifted window avoids that event.
router.post('/sleep-window/apply-suggestion', requireAuth, async (req, res) => {
  try {
    const { date, proposed_event } = req.body || {};
    const goal = await getActiveSleepGoal(req.user.user_id);
    if (!goal) return res.status(404).json({ error: 'No active sleep goal found' });

    const result = await buildScheduleSuggestions({
      userId: req.user.user_id,
      date,
      proposedEvent: proposed_event
        ? { start_datetime: proposed_event.start_datetime, end_datetime: proposed_event.end_datetime }
        : null,
    });

    const anchorDatePart = String(result.anchor_date || '').trim() || String(result.sleep_window?.start || '').split(' ')[0];
    const dow = anchorDatePart ? new Date(`${anchorDatePart}T00:00:00`).getDay() : new Date(`${date}T00:00:00`).getDay();
    const startTime = String(result.sleep_window?.start || '').split(' ')[1] || null;
    const endTime = String(result.sleep_window?.end || '').split(' ')[1] || null;
    if (!startTime || !endTime) return res.status(500).json({ error: 'Failed to compute sleep window times' });

    await upsertSleepWindow(goal.sleep_goal_id, { day_of_week: dow, start_time: startTime, end_time: endTime });
    res.json({
      ok: true,
      sleep_window: result.sleep_window,
      moved_sleep_window: Boolean(result.moved_sleep_window),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to apply sleep window suggestion', details: err.message });
  }
});

export default router;
