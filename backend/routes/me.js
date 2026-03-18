import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { parseIcs } from '../import/ics.js';
import { buildScheduleSuggestions } from '../schedule/suggestions.js';
import {
  createOrUpdateSleepGoal,
  createTask,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  getCalendarEventById,
  getActiveSleepGoal,
  getSleepWindows,
  getTaskById,
  getUserTasks,
  updateCalendarEvent,
  updateTask,
  updateUserProfile,
  upsertImportedCalendarEvent,
  upsertSleepWindow,
  upsertTaskCalendarEvent,
} from '../queries.js';
import { pushLocalEventToGoogle, deleteGoogleEventForLocal } from '../google/calendar.js';

const router = express.Router();

const VALID_GOAL_TYPES = new Set(['fixed_bedtime', 'fixed_wake_time', 'fixed_duration']);

function isValidTimeString(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(value);
}

function isNullableTimeString(value) {
  return value === null || value === undefined || isValidTimeString(value);
}

router.get('/', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { first_name, last_name, timezone } = req.body || {};
    const user = await updateUserProfile(req.user.user_id, { first_name, last_name, timezone });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile', details: err.message });
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
    const created = await createTask(req.user.user_id, req.body || {});
    await upsertTaskCalendarEvent(req.user.user_id, created);
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof Error && err.message === 'Title is required') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to create task', details: err.message });
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
    const updated = await updateTask(req.params.taskId, req.body || {});
    if (!updated || updated.user_id !== req.user.user_id) return res.status(404).json({ error: 'Task not found' });
    await upsertTaskCalendarEvent(req.user.user_id, updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task', details: err.message });
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
    const created = await createCalendarEvent(req.user.user_id, req.body || {});
    if (req.user.google_refresh_token) {
      void pushLocalEventToGoogle({ user: req.user, event: created });
    }
    res.json(created);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create calendar event', details: err.message });
  }
});

router.put('/calendar-events/:eventId', requireAuth, async (req, res) => {
  try {
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
    const existing = await getCalendarEventById(req.user.user_id, req.params.eventId);
    const deleted = await deleteCalendarEvent(req.user.user_id, req.params.eventId);
    if (!deleted) return res.status(404).json({ error: 'Event not found' });
    if (existing && req.user.google_refresh_token) {
      void deleteGoogleEventForLocal({ user: req.user, event: existing });
    }
    res.json({ ok: true });
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
    const { date } = req.body || {};
    const result = await buildScheduleSuggestions({ userId: req.user.user_id, date });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to build suggestions', details: err.message });
  }
});

export default router;
