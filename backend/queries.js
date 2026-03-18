import pool from './db.js';

function asNullIfEmpty(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : v;
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
  try {
    const { title, notes, priority, status, estimated_minutes, due_datetime } = updates;
    const result = await pool.query(
      `UPDATE "Task" 
       SET title = $1, notes = $2, priority = $3, status = $4, estimated_minutes = $5, due_datetime = $6
       WHERE task_id = $7 
       RETURNING *`,
      [title, notes, priority, status, estimated_minutes, due_datetime || null, taskId]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Error updating task:', err);
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

export async function createOrUpdateSleepGoal(userId, { goal_type, target_sleep_minutes, bedtime_flex_minutes }) {
  const existing = await getActiveSleepGoal(userId);
  if (!existing) {
    const result = await pool.query(
      `INSERT INTO "SleepGoal" (user_id, goal_type, target_sleep_minutes, bedtime_flex_minutes, active, updated_at)
       VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP)
       RETURNING *`,
      [userId, goal_type, target_sleep_minutes ?? null, bedtime_flex_minutes ?? 0]
    );
    return result.rows[0];
  }

  const result = await pool.query(
    `UPDATE "SleepGoal"
     SET goal_type = $2,
         target_sleep_minutes = $3,
         bedtime_flex_minutes = COALESCE($4, bedtime_flex_minutes),
         updated_at = CURRENT_TIMESTAMP
     WHERE sleep_goal_id = $1
     RETURNING *`,
    [existing.sleep_goal_id, goal_type, target_sleep_minutes ?? null, bedtime_flex_minutes]
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
       SET start_time = $3, end_time = $4
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
  const where = ['user_id = $1'];

  if (from) {
    params.push(from);
    where.push(`start_datetime >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    where.push(`start_datetime < $${params.length}`);
  }

  const result = await pool.query(
    `SELECT event_id, user_id, task_id, title, description, start_datetime, end_datetime, status,
            source, external_uid, is_all_day
     FROM "CalendarEvent"
     WHERE ${where.join(' AND ')}
     ORDER BY start_datetime ASC`,
    params
  );
  return result.rows;
}

export async function getCalendarEventById(userId, eventId) {
  const result = await pool.query(
    `SELECT event_id, user_id, title, description, start_datetime, end_datetime, status, source,
            external_uid, is_all_day, google_event_id
     FROM "CalendarEvent"
     WHERE event_id = $1 AND user_id = $2`,
    [eventId, userId]
  );
  return result.rows[0];
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
  } = event;

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
