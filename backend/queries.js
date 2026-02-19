import pool from './db.js';

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
    const result = await pool.query('SELECT user_id, email, first_name, last_name FROM "User" ORDER BY created_at DESC');
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
      'SELECT user_id, email, first_name, last_name, timezone FROM "User" WHERE user_id = $1',
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
