import pool from './db.js';
import { hashPassword } from './auth/password.js';

export const DEFAULT_ADMIN_EMAIL = 'admin@sleep-guardian.local';

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

function normalizeReminderMethod(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'text_message' ? 'text_message' : 'email';
}

let recurrenceSeriesIdColumnExistsCache = null;
async function recurrenceSeriesIdColumnExists() {
  if (recurrenceSeriesIdColumnExistsCache != null) return recurrenceSeriesIdColumnExistsCache;
  const result = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'CalendarEvent'
       AND column_name = 'recurrence_series_id'
     LIMIT 1`
  );
  recurrenceSeriesIdColumnExistsCache = result.rows.length > 0;
  return recurrenceSeriesIdColumnExistsCache;
}

let userPhoneNumberColumnExistsCache = null;
/** True if `"User".phone_number` exists (migration 008). Older DBs omit this column. */
export async function userPhoneNumberColumnExists() {
  if (userPhoneNumberColumnExistsCache != null) return userPhoneNumberColumnExistsCache;
  try {
    const result = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'User'
         AND column_name = 'phone_number'
       LIMIT 1`
    );
    userPhoneNumberColumnExistsCache = result.rows.length > 0;
  } catch {
    userPhoneNumberColumnExistsCache = false;
  }
  return userPhoneNumberColumnExistsCache;
}

let reminderMethodColumnExistsCache = null;
/** True if `"Reminder".method` exists (migration 007). Older DBs omit this column. */
export async function reminderMethodColumnExists() {
  if (reminderMethodColumnExistsCache != null) return reminderMethodColumnExistsCache;
  try {
    const result = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'Reminder'
         AND column_name = 'method'
       LIMIT 1`
    );
    reminderMethodColumnExistsCache = result.rows.length > 0;
  } catch {
    reminderMethodColumnExistsCache = false;
  }
  return reminderMethodColumnExistsCache;
}

let streakTypeColumnExistsCache = null;
export async function streakTypeColumnExists() {
  if (streakTypeColumnExistsCache != null) return streakTypeColumnExistsCache;
  try {
    const result = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'User'
         AND column_name = 'streak_type'
       LIMIT 1`
    );
    streakTypeColumnExistsCache = result.rows.length > 0;
  } catch {
    streakTypeColumnExistsCache = false;
  }
  return streakTypeColumnExistsCache;
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

/** Naive SQL timestamps for task times — match calendar/app (wall clock), not UTC-shifted. */
function normalizeTaskPlannedTimestamp(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const s = String(v).trim().replace('T', ' ').replace(/Z$/i, '');
    const dot = s.indexOf('.');
    const base = dot >= 0 ? s.slice(0, dot) : s;
    const m = base.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    if (m[2] == null) return null;
    const sec = m[4] != null ? m[4] : '00';
    return `${m[1]} ${m[2]}:${m[3]}:${sec}`;
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    // Treat DB-naive timestamp as a wall-clock string (use UTC getters to preserve the stored components).
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
  }
  return null;
}

/** Fixed calendar length for the "due" marker (work block uses estimated_minutes). */
const TASK_DUE_CALENDAR_DURATION_MIN = 15;

export async function upsertTaskCalendarEvent(userId, task) {
  if (!task || !task.task_id) return null;

  const minutes = Number(task.estimated_minutes || 0);
  const startStr = normalizeTaskPlannedTimestamp(task.planned_datetime);
  const dueStr = normalizeTaskPlannedTimestamp(task.due_datetime);

  let plannedUpdated = null;
  let dueUpdated = null;

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

  // Due marker on calendar at deadline (even when there is no planned work block).
  // Always upsert when due_datetime exists; if it overlaps planned start, we still keep it
  // so the user sees the deadline after dragging.
  if (dueStr) {
    const dueDur = TASK_DUE_CALENDAR_DURATION_MIN;
    const existingDue = await pool.query(
      `SELECT event_id FROM "CalendarEvent"
       WHERE user_id = $1 AND task_id = $2 AND source = $3
       LIMIT 1`,
      [userId, task.task_id, 'task_due']
    );

    if (existingDue.rows[0]) {
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
          existingDue.rows[0].event_id,
          userId,
          asNullIfEmpty(task.title),
          asNullIfEmpty(task.notes),
          dueStr,
          dueDur,
          asNullIfEmpty(task.status) || 'scheduled',
        ]
      );
      dueUpdated = result.rows[0];
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
          dueStr,
          dueDur,
          asNullIfEmpty(task.status) || 'scheduled',
          'task_due',
        ]
      );
      dueUpdated = result.rows[0];
    }
  } else {
    await pool.query(
      `DELETE FROM "CalendarEvent" WHERE user_id = $1 AND task_id = $2 AND source = $3`,
      [userId, task.task_id, 'task_due']
    );
  }

  return plannedUpdated || dueUpdated;
}

export async function deleteTaskCalendarEvents(userId, taskId) {
  // Tasks are represented in the calendar as separate rows.
  // Deleting the task alone leaves CalendarEvent rows behind because of FK behavior (task_id -> NULL).
  await pool.query(
    `DELETE FROM "CalendarEvent" WHERE user_id = $1 AND task_id = $2 AND source = $3`,
    [userId, taskId, 'task_due']
  );

  await pool.query(
    `DELETE FROM "CalendarEvent" WHERE user_id = $1 AND task_id = $2 AND source = $3`,
    [userId, taskId, 'task_planned']
  );

  // Legacy / cleanup: some older code may have used source='task'
  await pool.query(
    `DELETE FROM "CalendarEvent" WHERE user_id = $1 AND task_id = $2 AND source = $3`,
    [userId, taskId, 'task']
  );
}

// Get all users
export async function getAllUsers() {
  try {
    const withPhone = await userPhoneNumberColumnExists();
    const cols = withPhone
      ? 'user_id, email, first_name, last_name, phone_number, timezone, google_calendar_id, is_admin, created_at'
      : 'user_id, email, first_name, last_name, timezone, google_calendar_id, is_admin, created_at';
    const result = await pool.query(`SELECT ${cols} FROM "User" ORDER BY created_at DESC`);
    if (!withPhone) result.rows.forEach((r) => { r.phone_number = null; });
    return result.rows;
  } catch (err) {
    console.error('Error fetching users:', err);
    throw err;
  }
}

// Get user by ID
export async function getUserById(userId) {
  try {
    const withPhone = await userPhoneNumberColumnExists();
    const withStreak = await streakTypeColumnExists();
    const streakCol = withStreak ? ', streak_type' : '';
    const cols = withPhone
      ? `user_id, email, first_name, last_name, phone_number, timezone, google_calendar_id, is_admin, created_at${streakCol}`
      : `user_id, email, first_name, last_name, timezone, google_calendar_id, is_admin, created_at${streakCol}`;
    const result = await pool.query(`SELECT ${cols} FROM "User" WHERE user_id = $1`, [userId]);
    const row = result.rows[0];
    if (row && !withPhone) row.phone_number = null;
    if (row && !withStreak) row.streak_type = 'RECORDING';
    return row;
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
  const withPhone = await userPhoneNumberColumnExists();
  const cols = withPhone
    ? 'user_id, email, password_hash, first_name, last_name, phone_number, timezone, google_calendar_id, is_admin'
    : 'user_id, email, password_hash, first_name, last_name, timezone, google_calendar_id, is_admin';
  const result = await pool.query(`SELECT ${cols} FROM "User" WHERE email = $1`, [email]);
  const row = result.rows[0];
  if (row && !withPhone) row.phone_number = null;
  return row;
}

export async function updateUserGoogleIntegration(userId, { google_refresh_token, google_calendar_id }) {
  const withPhone = await userPhoneNumberColumnExists();
  const returning = withPhone
    ? 'RETURNING user_id, email, first_name, last_name, phone_number, timezone, google_calendar_id'
    : 'RETURNING user_id, email, first_name, last_name, timezone, google_calendar_id';
  const result = await pool.query(
    `UPDATE "User"
     SET google_refresh_token = COALESCE($2, google_refresh_token),
         google_calendar_id = COALESCE($3, google_calendar_id)
     WHERE user_id = $1
     ${returning}`,
    [userId, google_refresh_token || null, google_calendar_id || null]
  );
  const row = result.rows[0];
  if (row && !withPhone) row.phone_number = null;
  return row;
}

export async function clearUserGoogleIntegration(userId) {
  await pool.query(
    `UPDATE "User"
     SET google_refresh_token = NULL,
         google_calendar_id = NULL
     WHERE user_id = $1`,
    [userId]
  );
}

export async function createUser({ email, password_hash, first_name, last_name, timezone }) {
  const result = await pool.query(
    `INSERT INTO "User" (email, password_hash, first_name, last_name, timezone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING user_id, email, first_name, last_name, phone_number, timezone, created_at`,
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
  const withPhone = await userPhoneNumberColumnExists();
  const withStreak = await streakTypeColumnExists();
  const phoneCol = withPhone ? ', u.phone_number' : '';
  const streakCol = withStreak ? ', u.streak_type' : '';
  const result = await pool.query(
    `SELECT u.user_id, u.email, u.first_name, u.last_name${phoneCol}, u.timezone,
            u.google_refresh_token, u.google_calendar_id, u.is_admin${streakCol}
     FROM "AuthSession" s
     JOIN "User" u ON u.user_id = s.user_id
     WHERE s.session_token = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > CURRENT_TIMESTAMP`,
    [sessionToken]
  );
  const row = result.rows[0];
  if (row && !withPhone) row.phone_number = null;
  if (row && !withStreak) row.streak_type = 'RECORDING';
  return row;
}

export async function updateUserProfile(userId, { email, first_name, last_name, phone_number, timezone }) {
  const withPhone = await userPhoneNumberColumnExists();
  if (withPhone) {
    const result = await pool.query(
      `UPDATE "User"
       SET email = COALESCE($2, email),
           first_name = COALESCE($3, first_name),
           last_name = COALESCE($4, last_name),
           phone_number = COALESCE($5, phone_number),
           timezone = COALESCE($6, timezone)
       WHERE user_id = $1
       RETURNING user_id, email, first_name, last_name, phone_number, timezone, is_admin`,
      [userId, asNullIfEmpty(email), asNullIfEmpty(first_name), asNullIfEmpty(last_name), asNullIfEmpty(phone_number), asNullIfEmpty(timezone)]
    );
    return result.rows[0];
  }
  const result = await pool.query(
    `UPDATE "User"
     SET email = COALESCE($2, email),
         first_name = COALESCE($3, first_name),
         last_name = COALESCE($4, last_name),
         timezone = COALESCE($5, timezone)
     WHERE user_id = $1
     RETURNING user_id, email, first_name, last_name, timezone, is_admin`,
    [userId, asNullIfEmpty(email), asNullIfEmpty(first_name), asNullIfEmpty(last_name), asNullIfEmpty(timezone)]
  );
  const row = result.rows[0];
  if (row) row.phone_number = null;
  return row;
}

export async function countAdminUsers() {
  const result = await pool.query(`SELECT COUNT(*)::int AS n FROM "User" WHERE is_admin = true`);
  return result.rows[0]?.n ?? 0;
}

export async function updateUserByAdmin(userId, updates) {
  const withPhone = await userPhoneNumberColumnExists();
  const fields = [];
  const params = [];
  let n = 1;
  if (updates.email !== undefined) {
    fields.push(`email = $${n++}`);
    params.push(asNullIfEmpty(updates.email));
  }
  if (updates.first_name !== undefined) {
    fields.push(`first_name = $${n++}`);
    params.push(asNullIfEmpty(updates.first_name));
  }
  if (updates.last_name !== undefined) {
    fields.push(`last_name = $${n++}`);
    params.push(asNullIfEmpty(updates.last_name));
  }
  if (withPhone && updates.phone_number !== undefined) {
    fields.push(`phone_number = $${n++}`);
    params.push(asNullIfEmpty(updates.phone_number));
  }
  if (updates.timezone !== undefined) {
    fields.push(`timezone = $${n++}`);
    params.push(asNullIfEmpty(updates.timezone));
  }
  if (updates.is_admin !== undefined) {
    fields.push(`is_admin = $${n++}`);
    params.push(Boolean(updates.is_admin));
  }
  if (fields.length === 0) {
    return getUserById(userId);
  }
  params.push(userId);
  const returning = withPhone
    ? 'RETURNING user_id, email, first_name, last_name, phone_number, timezone, google_calendar_id, is_admin, created_at'
    : 'RETURNING user_id, email, first_name, last_name, timezone, google_calendar_id, is_admin, created_at';
  const result = await pool.query(
    `UPDATE "User" SET ${fields.join(', ')} WHERE user_id = $${n} ${returning}`,
    params
  );
  return result.rows[0];
}

export async function updateUserStreakType(userId, streakType) {
  if (!(await streakTypeColumnExists())) {
    return null;
  }
  const v = String(streakType).toUpperCase() === 'GOAL_MET' ? 'GOAL_MET' : 'RECORDING';
  const withPhone = await userPhoneNumberColumnExists();
  const returning = withPhone
    ? 'RETURNING user_id, email, first_name, last_name, phone_number, timezone, streak_type, google_calendar_id'
    : 'RETURNING user_id, email, first_name, last_name, timezone, streak_type, google_calendar_id';
  const result = await pool.query(
    `UPDATE "User" SET streak_type = $2 WHERE user_id = $1
     ${returning}`,
    [userId, v]
  );
  const row = result.rows[0];
  if (row && !withPhone) row.phone_number = null;
  return row;
}

export async function deleteUserById(userId) {
  const result = await pool.query(`DELETE FROM "User" WHERE user_id = $1 RETURNING user_id`, [userId]);
  return result.rows[0] || null;
}

export async function ensureDefaultAdminUser() {
  const check = await pool.query(`SELECT 1 FROM "User" WHERE email = $1 LIMIT 1`, [DEFAULT_ADMIN_EMAIL]);
  if (check.rows.length > 0) return;
  const password_hash = await hashPassword('admin');
  await pool.query(`INSERT INTO "User" (email, password_hash, is_admin) VALUES ($1, $2, true)`, [
    DEFAULT_ADMIN_EMAIL,
    password_hash,
  ]);
}

export async function getBedtimeReminderSettings(userId) {
  const withPhone = await userPhoneNumberColumnExists();
  const phoneSelect = withPhone ? 'u.phone_number,' : 'NULL::varchar AS phone_number,';
  const result = await pool.query(
    `SELECT
       u.email,
       ${phoneSelect}
       r.reminder_id,
       r.type,
       r.method,
       r.minutes_before_bedtime,
       r.enabled,
       r.created_at,
       r.last_sent_at
     FROM "User" u
     LEFT JOIN "Reminder" r
       ON r.user_id = u.user_id
      AND r.type = 'bedtime'
     WHERE u.user_id = $1
     LIMIT 1`,
    [userId]
  );

  const row = result.rows[0];
  if (!row) return null;
  return {
    email: row.email || '',
    phone_number: row.phone_number || '',
    reminder: {
      reminder_id: row.reminder_id || null,
      type: 'bedtime',
      method: normalizeReminderMethod(row.method),
      minutes_before_bedtime: Number(row.minutes_before_bedtime ?? 30),
      enabled: Boolean(row.enabled),
      created_at: row.created_at || null,
      last_sent_at: row.last_sent_at || null,
    },
  };
}

export async function upsertBedtimeReminderSettings(
  userId,
  { email, phone_number, method, minutes_before_bedtime, enabled }
) {
  const normalizedMethod = normalizeReminderMethod(method);
  const normalizedMinutes = Math.max(0, Math.min(24 * 60, Math.round(Number(minutes_before_bedtime) || 0)));
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const withPhone = await userPhoneNumberColumnExists();
    const userResult = withPhone
      ? await client.query(
          `UPDATE "User"
           SET email = COALESCE($2, email),
               phone_number = $3
           WHERE user_id = $1
           RETURNING user_id, email, first_name, last_name, phone_number, timezone`,
          [userId, asNullIfEmpty(email), asNullIfEmpty(phone_number)]
        )
      : await client.query(
          `UPDATE "User"
           SET email = COALESCE($2, email)
           WHERE user_id = $1
           RETURNING user_id, email, first_name, last_name, timezone`,
          [userId, asNullIfEmpty(email)]
        );
    if (!withPhone && userResult.rows[0]) userResult.rows[0].phone_number = null;

    const existingReminder = await client.query(
      `SELECT reminder_id, last_sent_at
       FROM "Reminder"
       WHERE user_id = $1 AND type = 'bedtime'
       LIMIT 1`,
      [userId]
    );

    let reminder;
    if (existingReminder.rows[0]) {
      const result = await client.query(
        `UPDATE "Reminder"
         SET method = $3,
             minutes_before_bedtime = $4,
             enabled = $5
         WHERE reminder_id = $1 AND user_id = $2
         RETURNING reminder_id, type, method, minutes_before_bedtime, enabled, created_at, last_sent_at`,
        [
          existingReminder.rows[0].reminder_id,
          userId,
          normalizedMethod,
          normalizedMinutes,
          Boolean(enabled),
        ]
      );
      reminder = result.rows[0];
    } else {
      const result = await client.query(
        `INSERT INTO "Reminder" (user_id, type, method, minutes_before_bedtime, enabled)
         VALUES ($1, 'bedtime', $2, $3, $4)
         RETURNING reminder_id, type, method, minutes_before_bedtime, enabled, created_at, last_sent_at`,
        [userId, normalizedMethod, normalizedMinutes, Boolean(enabled)]
      );
      reminder = result.rows[0];
    }

    await client.query('COMMIT');

    return {
      user: userResult.rows[0],
      reminder: {
        ...reminder,
        method: normalizeReminderMethod(reminder?.method),
        minutes_before_bedtime: Number(reminder?.minutes_before_bedtime ?? normalizedMinutes),
        enabled: Boolean(reminder?.enabled),
      },
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function getActiveBedtimeReminders() {
  const withPhone = await userPhoneNumberColumnExists();
  const withMethod = await reminderMethodColumnExists();
  const phoneSelect = withPhone ? 'u.phone_number' : 'NULL::varchar AS phone_number';
  const methodSelect = withMethod ? 'r.method' : `'email'::varchar AS method`;
  const result = await pool.query(
    `SELECT
       r.reminder_id,
       r.user_id,
       ${methodSelect},
       r.minutes_before_bedtime,
       r.enabled,
       r.last_sent_at,
       u.email,
       ${phoneSelect},
       u.first_name,
       u.timezone,
       sg.sleep_goal_id,
       sg.target_bedtime
     FROM "Reminder" r
     JOIN "User" u ON u.user_id = r.user_id
     LEFT JOIN "SleepGoal" sg
       ON sg.user_id = r.user_id
      AND sg.active = true
     WHERE r.type = 'bedtime'
       AND r.enabled = true`
  );
  return result.rows.map((row) => ({
    ...row,
    method: normalizeReminderMethod(row.method),
    minutes_before_bedtime: Number(row.minutes_before_bedtime ?? 0),
  }));
}

export async function getSleepWindowsForGoals(sleepGoalIds) {
  const ids = Array.from(new Set((sleepGoalIds || []).filter(Boolean)));
  if (!ids.length) return [];

  const result = await pool.query(
    `SELECT sleep_goal_id, day_of_week, start_time, end_time
     FROM "SleepWindow"
     WHERE sleep_goal_id = ANY($1::uuid[])`,
    [ids]
  );
  return result.rows;
}

export async function markReminderSent(reminderId, sentAt) {
  await pool.query(
    `UPDATE "Reminder"
     SET last_sent_at = $2
     WHERE reminder_id = $1`,
    [reminderId, sentAt]
  );
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
  const hasRecurrenceSeriesId = await recurrenceSeriesIdColumnExists();
  const recurrenceSelect = hasRecurrenceSeriesId ? 'ce.recurrence_series_id' : 'NULL::uuid AS recurrence_series_id';

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
       ${recurrenceSelect},
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
  const hasRecurrenceSeriesId = await recurrenceSeriesIdColumnExists();
  const recurrenceSelect = hasRecurrenceSeriesId ? 'ce.recurrence_series_id' : 'NULL::uuid AS recurrence_series_id';

  const result = await pool.query(
    `SELECT event_id, user_id, title, description, start_datetime, end_datetime, status, source,
            external_uid, is_all_day, google_event_id, ${recurrenceSelect}
     FROM "CalendarEvent"
     WHERE event_id = $1 AND user_id = $2`,
    [eventId, userId]
  );
  return result.rows[0];
}

export async function getCalendarEventsBySeriesId(userId, recurrenceSeriesId) {
  const hasRecurrenceSeriesId = await recurrenceSeriesIdColumnExists();
  if (!hasRecurrenceSeriesId) return [];

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

export async function getOnboardingSleepGoalReminderPercentage({ intervalDays = 7 } = {}) {
  const result = await pool.query(
    `WITH per_user AS (
      SELECT
        u.user_id,
        EXISTS (
          SELECT 1
          FROM "SleepGoal" sg
          WHERE sg.user_id = u.user_id
            AND sg.created_at >= u.created_at
            AND sg.created_at < (u.created_at + ($1::int * interval '1 day'))
        ) AS has_goal,
        EXISTS (
          SELECT 1
          FROM "Reminder" r
          WHERE r.user_id = u.user_id
            AND r.enabled = true
            AND r.created_at >= u.created_at
            AND r.created_at < (u.created_at + ($1::int * interval '1 day'))
        ) AS has_reminder
      FROM "User" u
      WHERE u.created_at IS NOT NULL
    )
    SELECT
      COALESCE(
        ROUND(
          (100.0 * COUNT(*) FILTER (WHERE has_goal AND has_reminder)::numeric)
          / NULLIF(COUNT(*), 0),
          2
        ),
        0
      ) AS percentage,
      COUNT(*) FILTER (WHERE has_goal AND has_reminder) AS numerator_count,
      COUNT(*) AS denominator_count
    FROM per_user;`,
    [intervalDays],
  );

  const row = result.rows[0] || { percentage: 0, numerator_count: 0, denominator_count: 0 };
  return {
    percentage: Number(row.percentage),
    numerator_count: Number(row.numerator_count),
    denominator_count: Number(row.denominator_count),
    interval_days: intervalDays,
  };
}

export async function getDailySleepLogByDate(userId, logDate) {
  const result = await pool.query(
    `SELECT daily_sleep_log_id, user_id, log_date, sleep_goal_hours, actual_sleep_hours,
            wake_up_count, mood, factors, latency_minutes, created_at, updated_at
     FROM "DailySleepLog"
     WHERE user_id = $1 AND log_date = $2::date
     LIMIT 1`,
    [userId, logDate]
  );
  return result.rows[0] || null;
}

export async function upsertDailySleepLog(userId, payload) {
  const {
    log_date,
    sleep_goal_hours,
    actual_sleep_hours,
    wake_up_count,
    mood,
    factors,
    latency_minutes,
  } = payload;

  const latResolved =
    latency_minutes == null || latency_minutes === ''
      ? null
      : Math.max(0, Math.floor(Number(latency_minutes)));

  const baseParams = [
    userId,
    log_date,
    Number(sleep_goal_hours),
    Number(actual_sleep_hours),
    Math.max(0, Math.floor(Number(wake_up_count) || 0)),
    String(mood),
    Array.isArray(factors) ? factors.map(String) : [],
  ];

  const run = (lat) =>
    pool.query(
      `INSERT INTO "DailySleepLog"
        (user_id, log_date, sleep_goal_hours, actual_sleep_hours, wake_up_count, mood, factors, latency_minutes)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7::text[], $8)
       ON CONFLICT (user_id, log_date) DO UPDATE SET
         sleep_goal_hours = EXCLUDED.sleep_goal_hours,
         actual_sleep_hours = EXCLUDED.actual_sleep_hours,
         wake_up_count = EXCLUDED.wake_up_count,
         mood = EXCLUDED.mood,
         factors = EXCLUDED.factors,
         latency_minutes = EXCLUDED.latency_minutes,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [...baseParams, lat],
    );

  try {
    const result = await run(latResolved);
    return result.rows[0];
  } catch (err) {
    // Older DBs: latency_minutes NOT NULL (before migration 010). Retry once with 30 so the log still saves.
    const code = err && typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
    if (latResolved == null && code === '23502') {
      const retry = await run(30);
      return retry.rows[0];
    }
    throw err;
  }
}

export async function listDailySleepLogsInRange(userId, fromDate, toDate) {
  const result = await pool.query(
    `SELECT daily_sleep_log_id, user_id, log_date, sleep_goal_hours, actual_sleep_hours,
            wake_up_count, mood, factors, latency_minutes, created_at, updated_at
     FROM "DailySleepLog"
     WHERE user_id = $1 AND log_date >= $2::date AND log_date <= $3::date
     ORDER BY log_date ASC`,
    [userId, fromDate, toDate],
  );
  return result.rows;
}
