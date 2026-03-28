import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool, { testConnection } from './db.js';
import { getUserTasks, getAllUsers, getUserById, updateTask } from './queries.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import googleRoutes from './routes/google.js';
import okrRoutes from './routes/okr.js';
import { startBedtimeReminderService } from './reminders/service.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

const frontendOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!frontendOrigins.includes('http://localhost:8080')) frontendOrigins.push('http://localhost:8080');
if (!frontendOrigins.includes('http://127.0.0.1:8080')) frontendOrigins.push('http://127.0.0.1:8080');
if (!frontendOrigins.includes('http://localhost:5173')) frontendOrigins.push('http://localhost:5173');
if (!frontendOrigins.includes('http://127.0.0.1:5173')) frontendOrigins.push('http://127.0.0.1:5173');
if (!frontendOrigins.includes('http://[::1]:8080')) frontendOrigins.push('http://[::1]:8080');
if (!frontendOrigins.includes('http://[::1]:5173')) frontendOrigins.push('http://[::1]:5173');

function isLocalDevBrowserOrigin(origin) {
  try {
    const u = new URL(origin);
    const h = u.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
  } catch {
    return false;
  }
}

/** Allow Vite --host / LAN URLs (e.g. http://192.168.x.x:8080) during local development. */
function isPrivateLanDevOrigin(origin) {
  try {
    const u = new URL(origin);
    const h = u.hostname;
    const parts = h.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  } catch {
    return false;
  }
}

const isProduction = process.env.NODE_ENV === 'production';

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (frontendOrigins.includes(origin)) return callback(null, true);
      if (isLocalDevBrowserOrigin(origin)) return callback(null, true);
      if (!isProduction && isPrivateLanDevOrigin(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    name: 'Luna API',
    message: 'Use paths under /api/*. The web UI is served separately (see README).',
    openApp: 'http://localhost:8080/',
    examples: ['/api/health', '/api/db-health'],
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Luna API is running' });
});

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

app.get('/api/users', async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users', details: err.message });
  }
});

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

app.get('/api/users/:userId/tasks', async (req, res) => {
  try {
    const tasks = await getUserTasks(req.params.userId);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks', details: err.message });
  }
});

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

app.get('/api/example', (req, res) => {
  res.json({ message: 'This is an example endpoint' });
});

app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/okr', okrRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  const dbConnected = await testConnection();

  if (!dbConnected) {
    console.warn('Warning: Database connection failed. Some features may not work.');
  }

  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });

  startBedtimeReminderService();
}

start();
