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
  getActiveSleepGoal,
  getSleepWindows,
  getUserTasks,
  updateCalendarEvent,
  updateTask,
  updateUserProfile,
  upsertImportedCalendarEvent,
  upsertSleepWindow,
  upsertTaskCalendarEvent,
} from '../queries.js';

const router = express.Router();

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
    const { goal_type, target_sleep_minutes, bedtime_flex_minutes, windows } = req.body || {};
    if (typeof goal_type !== 'string') return res.status(400).json({ error: 'goal_type is required' });

    const goal = await createOrUpdateSleepGoal(req.user.user_id, {
      goal_type,
      target_sleep_minutes: target_sleep_minutes ?? null,
      bedtime_flex_minutes: bedtime_flex_minutes ?? null,
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
    res.json(created);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create calendar event', details: err.message });
  }
});

router.put('/calendar-events/:eventId', requireAuth, async (req, res) => {
  try {
    const updated = await updateCalendarEvent(req.user.user_id, req.params.eventId, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Event not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update calendar event', details: err.message });
  }
});

router.delete('/calendar-events/:eventId', requireAuth, async (req, res) => {
  try {
    const deleted = await deleteCalendarEvent(req.user.user_id, req.params.eventId);
    if (!deleted) return res.status(404).json({ error: 'Event not found' });
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
