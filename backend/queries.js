import pool from './db.js';

function asNullIfEmpty(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : v;
}

/** Local wall-clock timestamp for PostgreSQL TIMESTAMP columns (avoids JS Date → driver TZ drift). */
function toPgTimestampLocal(date) {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function coalesceEstimatedMinutes(v) {
  if (v === undefined || v === null) return undefined;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function isMissingColumnError(err, columnName) {
  return err instanceof Error && err.message?.includes(columnName) && err.message?.includes('does not exist');
}

// Get all tasks for a user
export async function getUserTasks(userId) {
  try {
    const result = await pool.query(
      'SELECT * FROM "Task" WHERE user_id = $1 ORDER BY priority ASC, created_at DESC',
      [userId]
    );
    return result.rows;
  } catch (err) {
    console.error('Error fetching user tasks:', err);
    throw err;
  }
}

// Get task by ID
export async function getTaskById(taskId) {
  try {
    const result = await pool.query(
      'SELECT * FROM "Task" WHERE task_id = $1',
      [taskId]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Error fetching task:', err);
    throw err;
  }
}

export async function getTasksBySeriesId(userId, recurrenceSeriesId) {
  const result = await pool.query(
    `SELECT * FROM "Task"
     WHERE user_id = $1 AND recurrence_series_id = $2
     ORDER BY planned_datetime ASC NULLS LAST, created_at ASC`,
    [userId, recurrenceSeriesId]
  );
  return result.rows;
}

export async function createTask(userId, task) {
  const {
    title,
    notes,
    priority,
    status,
    planned_datetime,
    estimated_minutes,
    due_datetime,
    category,
    recurrence_series_id,
  } = task || {};

  if (typeof title !== 'string' || !title.trim()) {
    throw new Error('Title is required');
  }

  const prio = Number.isFinite(priority) ? priority : 3;
  const estMinutes = coalesceEstimatedMinutes(estimated_minutes) ?? 0;
  const safeStatus = typeof status === 'string' && status.trim().length > 0 ? status : 'pending';

  const values = [
    userId,
    title.trim(),
    asNullIfEmpty(notes),
    prio,
    safeStatus,
    planned_datetime || null,
    estMinutes,
    due_datetime || null,
    asNullIfEmpty(category),
  ];

  const runInsert = async ({ includePlannedDateTime = true, includeCategory = true } = {}) => {
    const columns = ['user_id', 'title', 'notes', 'priority', 'status'];
    const params = [values[0], values[1], values[2], values[3], values[4]];

    if (includePlannedDateTime) {
      columns.push('planned_datetime');
      params.push(values[5]);
    }

    columns.push('estimated_minutes', 'due_datetime');
    params.push(values[6], values[7]);

    if (includeCategory) {
      columns.push('category');
      params.push(values[8]);
    }

    const placeholders = params.map((_, index) => `$${index + 1}`).join(', ');
    const result = await pool.query(
      `INSERT INTO "Task" (user_id, title, notes, priority, status, planned_datetime, estimated_minutes, due_datetime, category, recurrence_series_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        userId,
        title.trim(),
        asNullIfEmpty(notes),
        prio,
        safeStatus,
        planned_datetime || null,
        estMinutes,
        due_datetime || null,
        asNullIfEmpty(category),
        recurrence_series_id || null,
      ]
      
    );
    return result.rows[0];
  };

  try {
    return await runInsert();
  } catch (err) {
    if (err instanceof Error && err.message?.includes('recurrence_series_id') && err.message?.includes('does not exist')) {
      const result = await pool.query(
        `INSERT INTO "Task" (user_id, title, notes, priority, status, planned_datetime, estimated_minutes, due_datetime, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          userId,
          title.trim(),
          asNullIfEmpty(notes),
          prio,
          safeStatus,
          planned_datetime || null,
          estMinutes,
          due_datetime || null,
          asNullIfEmpty(category),
        ]
      );
      return result.rows[0];
    }
    if (err instanceof Error && err.message?.includes('category') && err.message?.includes('does not exist')) {
      const result = await pool.query(
        `INSERT INTO "Task" (user_id, title, notes, priority, status, planned_datetime, estimated_minutes, due_datetime, recurrence_series_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          userId,
          title.trim(),
          asNullIfEmpty(notes),
          prio,
          safeStatus,
          planned_datetime || null,
          estMinutes,
          due_datetime || null,
          recurrence_series_id || null,
        ]
      );
      return result.rows[0];
    }

    if (isMissingColumnError(err, 'planned_datetime')) {
      try {
        return await runInsert({ includePlannedDateTime: false });
      } catch (retryErr) {
        if (isMissingColumnError(retryErr, 'category')) {
          return await runInsert({ includePlannedDateTime: false, includeCategory: false });
        }
        throw retryErr;
      }
    }

    throw err;
  }
}

function normalizeTaskPlannedTimestamp(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const s = v.replace('T', ' ').trim().replace(/Z$/i, '');
    const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    const sec = m[4] != null ? m[4] : '00';
    return `${m[1]} ${m[2]}:${m[3]}:${sec}`;
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
  }
  return null;
}

export async function upsertTaskCalendarEvent(userId, task) {
  if (!task || !task.task_id) return null;

  const minutes = Number(task.estimated_minutes || 0);
  const startStr = normalizeTaskPlannedTimestamp(task.planned_datetime);

  let plannedUpdated = null;

  // Remove due-date calendar events; tasks only appear when planned
  await pool.query(
    `DELETE FROM "CalendarEvent" WHERE user_id = $1 AND task_id = $2 AND source = $3`,
    [userId, task.task_id, 'task_due']
  );

  // Cleanup legacy combined task event entries (source='task').
  await pool.query(
    `DELETE FROM "CalendarEvent" WHERE user_id = $1 AND task_id = $2 AND source = $3`,
    [userId, task.task_id, 'task']
  );

  // Planned calendar event — end time via SQL interval so server timezone does not skew naive timestamps.
  if (startStr && minutes > 0) {
    const existing = await pool.query(
      `SELECT event_id FROM "CalendarEvent"
       WHERE user_id = $1 AND task_id = $2 AND source = $3
       LIMIT 1`,
      [userId, task.task_id, 'task_planned']
    );

    if (existing.rows[0]) {
      const result = await pool.query(
        `UPDATE "CalendarEvent"
         SET title = $3,
             description = $4,
             start_datetime = $5::timestamp,
             end_datetime = $5::timestamp + ($6::int * interval '1 minute'),
             status = $7
         WHERE event_id = $1 AND user_id = $2
         RETURNING *`,
        [
          existing.rows[0].event_id,
          userId,
          asNullIfEmpty(task.title),
          asNullIfEmpty(task.notes),
          startStr,
          minutes,
          asNullIfEmpty(task.status) || 'scheduled',
        ]
      );
      plannedUpdated = result.rows[0];
    } else {
      const result = await pool.query(
        `INSERT INTO "CalendarEvent"
         (user_id, task_id, title, description, start_datetime, end_datetime, status, source)
         VALUES ($1, $2, $3, $4, $5::timestamp, $5::timestamp + ($6::int * interval '1 minute'), $7, $8)
         RETURNING *`,
        [
          userId,
          task.task_id,
          asNullIfEmpty(task.title),
          asNullIfEmpty(task.notes),
          startStr,
          minutes,
          asNullIfEmpty(task.status) || 'scheduled',
          'task_planned',
        ]
      );
      plannedUpdated = result.rows[0];
    }
  } else {
    await pool.query(
      `DELETE FROM "CalendarEvent" WHERE user_id = $1 AND task_id = $2 AND source = $3`,
      [userId, task.task_id, 'task_planned']
    );
  }

  return plannedUpdated;
}

// Get all users
export async function getAllUsers() {
  try {
    const result = await pool.query(
      'SELECT user_id, email, first_name, last_name, timezone, google_calendar_id FROM "User" ORDER BY created_at DESC'
    );
    return result.rows;
  } catch (err) {
    console.error('Error fetching users:', err);
    throw err;
  }
}

// Get user by ID
export async function getUserById(userId) {
  try {
    const result = await pool.query(
      'SELECT user_id, email, first_name, last_name, timezone, google_calendar_id FROM "User" WHERE user_id = $1',
      [userId]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Error fetching user:', err);
    throw err;
  }
}

// Update task
export async function updateTask(taskId, updates) {
  const { title, notes, priority, status, estimated_minutes, planned_datetime, due_datetime, category } = updates || {};
  const est =
    estimated_minutes === undefined || estimated_minutes === null
      ? 0
      : coalesceEstimatedMinutes(estimated_minutes) ?? 0;
  const params = [
    title,
    notes ?? null,
    priority ?? 3,
    status ?? 'pending',
    est,
    planned_datetime || null,
    due_datetime || null,
    category ?? null,
    taskId,
  ];
  const values = {
    title,
    notes: notes ?? null,
    priority: priority ?? 3,
    status: status ?? 'pending',
    estimated_minutes: Number.isFinite(estimated_minutes) ? estimated_minutes : 0,
    planned_datetime: planned_datetime || null,
    due_datetime: due_datetime || null,
    category: category ?? null,
  };

  const runUpdate = async ({ includePlannedDateTime = true, includeCategory = true } = {}) => {
    const assignments = [
      'title = $1',
      'notes = $2',
      'priority = $3',
      'status = $4',
      'estimated_minutes = $5',
    ];
    const params = [
      values.title,
      values.notes,
      values.priority,
      values.status,
      values.estimated_minutes,
    ];

    if (includePlannedDateTime) {
      assignments.push(`planned_datetime = $${params.length + 1}`);
      params.push(values.planned_datetime);
    }

    assignments.push(`due_datetime = $${params.length + 1}`);
    params.push(values.due_datetime);

    if (includeCategory) {
      assignments.push(`category = $${params.length + 1}`);
      params.push(values.category);
    }

    params.push(taskId);

    const result = await pool.query(
      `UPDATE "Task"
       SET ${assignments.join(', ')}
       WHERE task_id = $${params.length}
       RETURNING *`,
      params
    );
    return result.rows[0];
  };

  try {
    return await runUpdate();
  } catch (err) {
    if (isMissingColumnError(err, 'category')) {
      try {
        return await runUpdate({ includeCategory: false });
      } catch (retryErr) {
        if (isMissingColumnError(retryErr, 'planned_datetime')) {
          return await runUpdate({ includePlannedDateTime: false, includeCategory: false });
        }
        console.error('Error updating task:', retryErr);
        throw retryErr;
      }
    }

    if (isMissingColumnError(err, 'planned_datetime')) {
      try {
        return await runUpdate({ includePlannedDateTime: false });
      } catch (retryErr) {
        if (isMissingColumnError(retryErr, 'category')) {
          return await runUpdate({ includePlannedDateTime: false, includeCategory: false });
        }
        console.error('Error updating task:', retryErr);
        throw retryErr;
      }
    }
    console.error('Error updating task:', err);
    throw err;
  }
}

export async function deleteTask(userId, taskId) {
  const result = await pool.query(
    `DELETE FROM "Task" WHERE user_id = $1 AND task_id = $2 RETURNING *`,
    [userId, taskId]
  );
  return result.rows[0];
}

export async function deleteTasksBySeriesId(userId, recurrenceSeriesId) {
  const result = await pool.query(
    `DELETE FROM "Task"
     WHERE user_id = $1 AND recurrence_series_id = $2
     RETURNING *`,
    [userId, recurrenceSeriesId]
  );
  return result.rows;
}

export async function updateTaskStatus(taskId, userId, status) {
  const normalizedStatus = typeof status === 'string' && status.trim()
    ? status.trim().toLowerCase()
    : 'pending';

  try {
    const result = await pool.query(
      `UPDATE "Task"
       SET status = $3
       WHERE task_id = $1 AND user_id = $2
       RETURNING *`,
      [taskId, userId, normalizedStatus]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Error updating task status:', err);
    throw err;
  }
}

export async function getUserByEmail(email) {
  const result = await pool.query(
    'SELECT user_id, email, password_hash, first_name, last_name, timezone, google_calendar_id FROM "User" WHERE email = $1',
    [email]
  );
  return result.rows[0];
}

export async function updateUserGoogleIntegration(userId, { google_refresh_token, google_calendar_id }) {
  const result = await pool.query(
    `UPDATE "User"
     SET google_refresh_token = COALESCE($2, google_refresh_token),
         google_calendar_id = COALESCE($3, google_calendar_id)
     WHERE user_id = $1
     RETURNING user_id, email, first_name, last_name, timezone, google_calendar_id`,
    [userId, google_refresh_token || null, google_calendar_id || null]
  );
  return result.rows[0];
}

export async function createUser({ email, password_hash, first_name, last_name, timezone }) {
  const result = await pool.query(
    `INSERT INTO "User" (email, password_hash, first_name, last_name, timezone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING user_id, email, first_name, last_name, timezone, created_at`,
    [email, password_hash, asNullIfEmpty(first_name), asNullIfEmpty(last_name), asNullIfEmpty(timezone)]
  );
  return result.rows[0];
}

export async function createSession({ userId, sessionToken, expiresAt }) {
  const result = await pool.query(
    `INSERT INTO "AuthSession" (user_id, session_token, expires_at)
     VALUES ($1, $2, $3)
     RETURNING session_id, session_token, expires_at`,
    [userId, sessionToken, expiresAt]
  );
  return result.rows[0];
}

export async function revokeSession(sessionToken) {
  await pool.query(
    `UPDATE "AuthSession"
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE session_token = $1 AND revoked_at IS NULL`,
    [sessionToken]
  );
}

export async function getUserBySessionToken(sessionToken) {
  const result = await pool.query(
    `SELECT u.user_id, u.email, u.first_name, u.last_name, u.timezone,
            u.google_refresh_token, u.google_calendar_id
     FROM "AuthSession" s
     JOIN "User" u ON u.user_id = s.user_id
     WHERE s.session_token = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > CURRENT_TIMESTAMP`,
    [sessionToken]
  );
  return result.rows[0];
}

export async function updateUserProfile(userId, { first_name, last_name, timezone }) {
  const result = await pool.query(
    `UPDATE "User"
     SET first_name = COALESCE($2, first_name),
         last_name = COALESCE($3, last_name),
         timezone = COALESCE($4, timezone)
     WHERE user_id = $1
     RETURNING user_id, email, first_name, last_name, timezone`,
    [userId, asNullIfEmpty(first_name), asNullIfEmpty(last_name), asNullIfEmpty(timezone)]
  );
  return result.rows[0];
}

export async function getActiveSleepGoal(userId) {
  const result = await pool.query(
    `SELECT sleep_goal_id, user_id, target_bedtime, target_wake_time, bedtime_flex_minutes,
            active, goal_type, target_sleep_minutes, updated_at
     FROM "SleepGoal"
     WHERE user_id = $1 AND active = true
     ORDER BY sleep_goal_id DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

export async function createOrUpdateSleepGoal(userId, { goal_type, target_sleep_minutes, target_bedtime, target_wake_time, bedtime_flex_minutes }) {
  const existing = await getActiveSleepGoal(userId);
  if (!existing) {
    const result = await pool.query(
      `INSERT INTO "SleepGoal" (user_id, target_bedtime, target_wake_time, goal_type, target_sleep_minutes, bedtime_flex_minutes, active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, CURRENT_TIMESTAMP)
       RETURNING *`,
      [userId, target_bedtime ?? null, target_wake_time ?? null, goal_type, target_sleep_minutes ?? null, bedtime_flex_minutes ?? 0]
    );
    return result.rows[0];
  }

  const result = await pool.query(
    `UPDATE "SleepGoal"
     SET target_bedtime = $2,
         target_wake_time = $3,
         goal_type = $4,
         target_sleep_minutes = $5,
         bedtime_flex_minutes = COALESCE($6, bedtime_flex_minutes),
         updated_at = CURRENT_TIMESTAMP
     WHERE sleep_goal_id = $1
     RETURNING *`,
    [existing.sleep_goal_id, target_bedtime ?? null, target_wake_time ?? null, goal_type, target_sleep_minutes ?? null, bedtime_flex_minutes]
  );
  return result.rows[0];
}

export async function getSleepWindows(sleepGoalId) {
  const result = await pool.query(
    `SELECT sleep_window_id, day_of_week, start_time, end_time
     FROM "SleepWindow"
     WHERE sleep_goal_id = $1
     ORDER BY day_of_week ASC`,
    [sleepGoalId]
  );
  return result.rows;
}

export async function upsertSleepWindow(sleepGoalId, { day_of_week, start_time, end_time }) {
  const existing = await pool.query(
    `SELECT sleep_window_id FROM "SleepWindow" WHERE sleep_goal_id = $1 AND day_of_week = $2 LIMIT 1`,
    [sleepGoalId, day_of_week]
  );
  if (existing.rows[0]) {
    const result = await pool.query(
      `UPDATE "SleepWindow"
       SET day_of_week = $2, start_time = $3, end_time = $4
       WHERE sleep_window_id = $1
       RETURNING *`,
      [existing.rows[0].sleep_window_id, day_of_week, start_time, end_time]
    );
    return result.rows[0];
  }

  const result = await pool.query(
    `INSERT INTO "SleepWindow" (sleep_goal_id, day_of_week, start_time, end_time)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [sleepGoalId, day_of_week, start_time, end_time]
  );
  return result.rows[0];
}

export async function getCalendarEvents(userId, { from, to } = {}) {
  const params = [userId];
  const where = ['ce.user_id = $1'];

  if (from) {
    params.push(from);
    where.push(`ce.start_datetime >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    where.push(`ce.start_datetime < $${params.length}`);
  }

  const result = await pool.query(
    `SELECT
       ce.event_id,
       ce.user_id,
       ce.task_id,
       ce.title,
       ce.description,
       ce.start_datetime,
       ce.end_datetime,
       ce.status,
       ce.source,
       ce.external_uid,
       ce.is_all_day,
       ce.recurrence_series_id,
       t.due_datetime AS task_due_datetime,
       t.status AS task_status,
       t.priority AS task_priority
     FROM "CalendarEvent" ce
     LEFT JOIN "Task" t ON t.task_id = ce.task_id
     WHERE ${where.join(' AND ')}
     ORDER BY ce.start_datetime ASC`,
    params
  );
  return result.rows;
}

export async function getConflictingCalendarEvents(userId, { start, end, excludeEventId, excludeTaskId } = {}) {
  if (!start || !end) return [];
  const params = [userId, start, end];
  const where = [
    'ce.user_id = $1',
    'ce.start_datetime < $3',
    'ce.end_datetime > $2',
  ];

  if (excludeEventId) {
    params.push(excludeEventId);
    where.push(`ce.event_id <> $${params.length}`);
  }
  if (excludeTaskId) {
    params.push(excludeTaskId);
    where.push(`(ce.task_id IS NULL OR ce.task_id <> $${params.length})`);
  }

  const result = await pool.query(
    `SELECT ce.event_id, ce.task_id, ce.title, ce.start_datetime, ce.end_datetime, ce.source
     FROM "CalendarEvent" ce
     WHERE ${where.join(' AND ')}
     ORDER BY ce.start_datetime ASC`,
    params
  );
  return result.rows;
}

export async function getCalendarEventById(userId, eventId) {
  const result = await pool.query(
    `SELECT event_id, user_id, title, description, start_datetime, end_datetime, status, source,
            external_uid, is_all_day, google_event_id, recurrence_series_id
     FROM "CalendarEvent"
     WHERE event_id = $1 AND user_id = $2`,
    [eventId, userId]
  );
  return result.rows[0];
}

export async function getCalendarEventsBySeriesId(userId, recurrenceSeriesId) {
  const result = await pool.query(
    `SELECT event_id, user_id, task_id, title, description, start_datetime, end_datetime, status, source,
            external_uid, is_all_day, google_event_id, recurrence_series_id
     FROM "CalendarEvent"
     WHERE user_id = $1 AND recurrence_series_id = $2
     ORDER BY start_datetime ASC`,
    [userId, recurrenceSeriesId]
  );
  return result.rows;
}

export async function createCalendarEvent(userId, event) {
  const {
    task_id,
    title,
    description,
    start_datetime,
    end_datetime,
    status,
    source,
    external_uid,
    is_all_day,
    recurrence_series_id,
  } = event;

  try {
    const result = await pool.query(
      `INSERT INTO "CalendarEvent"
        (user_id, task_id, title, description, start_datetime, end_datetime, status, source, external_uid, is_all_day, recurrence_series_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        userId,
        task_id || null,
        asNullIfEmpty(title),
        asNullIfEmpty(description),
        start_datetime || null,
        end_datetime || null,
        asNullIfEmpty(status) || 'scheduled',
        asNullIfEmpty(source) || 'manual',
        asNullIfEmpty(external_uid),
        typeof is_all_day === 'boolean' ? is_all_day : false,
        recurrence_series_id || null,
      ]
    );
    return result.rows[0];
  } catch (err) {
    if (err instanceof Error && err.message?.includes('recurrence_series_id') && err.message?.includes('does not exist')) {
      const result = await pool.query(
        `INSERT INTO "CalendarEvent"
          (user_id, task_id, title, description, start_datetime, end_datetime, status, source, external_uid, is_all_day)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          userId,
          task_id || null,
          asNullIfEmpty(title),
          asNullIfEmpty(description),
          start_datetime || null,
          end_datetime || null,
          asNullIfEmpty(status) || 'scheduled',
          asNullIfEmpty(source) || 'manual',
          asNullIfEmpty(external_uid),
          typeof is_all_day === 'boolean' ? is_all_day : false,
        ]
      );
      return result.rows[0];
    }
    throw err;
  }
}

export async function updateCalendarEvent(userId, eventId, updates) {
  const fields = [];
  const params = [eventId, userId];

  const set = (col, v) => {
    params.push(v);
    fields.push(`${col} = $${params.length}`);
  };

  if ('title' in updates) set('title', asNullIfEmpty(updates.title));
  if ('description' in updates) set('description', asNullIfEmpty(updates.description));
  if ('start_datetime' in updates) set('start_datetime', updates.start_datetime || null);
  if ('end_datetime' in updates) set('end_datetime', updates.end_datetime || null);
  if ('status' in updates) set('status', asNullIfEmpty(updates.status));
  if ('is_all_day' in updates) set('is_all_day', typeof updates.is_all_day === 'boolean' ? updates.is_all_day : false);
  if ('google_event_id' in updates) set('google_event_id', updates.google_event_id || null);

  if (!fields.length) return null;

  const result = await pool.query(
    `UPDATE "CalendarEvent"
     SET ${fields.join(', ')}
     WHERE event_id = $1 AND user_id = $2
     RETURNING *`,
    params
  );
  return result.rows[0];
}

export async function deleteCalendarEvent(userId, eventId) {
  const result = await pool.query(
    `DELETE FROM "CalendarEvent" WHERE event_id = $1 AND user_id = $2 RETURNING event_id`,
    [eventId, userId]
  );
  return result.rows[0];
}

export async function upsertImportedCalendarEvent(userId, event) {
  const { external_uid, title, description, start_datetime, end_datetime, is_all_day } = event;
  if (!external_uid) throw new Error('external_uid required for import upsert');

  const existing = await pool.query(
    `SELECT event_id FROM "CalendarEvent"
     WHERE user_id = $1 AND source = $2 AND external_uid = $3
     LIMIT 1`,
    [userId, 'ics', external_uid]
  );

  if (existing.rows[0]) {
    const result = await pool.query(
      `UPDATE "CalendarEvent"
       SET title = $3,
           description = $4,
           start_datetime = $5,
           end_datetime = $6,
           is_all_day = $7,
           status = 'scheduled'
       WHERE event_id = $1 AND user_id = $2
       RETURNING *`,
      [
        existing.rows[0].event_id,
        userId,
        asNullIfEmpty(title),
        asNullIfEmpty(description),
        start_datetime || null,
        end_datetime || null,
        typeof is_all_day === 'boolean' ? is_all_day : false,
      ]
    );
    return result.rows[0];
  }

  return await createCalendarEvent(userId, {
    title,
    description,
    start_datetime,
    end_datetime,
    status: 'scheduled',
    source: 'ics',
    external_uid,
    is_all_day,
  });
}
