import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool, { testConnection } from './db.js';
import { getUserTasks, getAllUsers, getUserById, updateTask } from './queries.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import googleRoutes from './routes/google.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Luna API is running' });
});

// Database health check route
app.get('/api/db-health', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    res.json({ status: 'OK', message: 'Database connection successful', timestamp: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: 'Database connection failed', error: err.message });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users', details: err.message });
  }
});

// Get user by ID
app.get('/api/users/:userId', async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user', details: err.message });
  }
});

// Get tasks for a user
app.get('/api/users/:userId/tasks', async (req, res) => {
  try {
    const tasks = await getUserTasks(req.params.userId);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks', details: err.message });
  }
});

// Update a task
app.put('/api/tasks/:taskId', async (req, res) => {
  try {
    const updatedTask = await updateTask(req.params.taskId, req.body);
    if (!updatedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(updatedTask);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task', details: err.message });
  }
});

// Example route
app.get('/api/example', (req, res) => {
  res.json({ message: 'This is an example endpoint' });
});

// Auth + current-user routes
app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/google', googleRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  const dbConnected = await testConnection();
  
  if (!dbConnected) {
    console.warn('⚠️ Warning: Database connection failed. Some features may not work.');
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
}

start();
