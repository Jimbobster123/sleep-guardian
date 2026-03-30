import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  countAdminUsers,
  deleteUserById,
  getAllUsers,
  getUserById,
  getUserTasks,
  updateUserByAdmin,
} from '../queries.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireAdmin);

router.get('/users', async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users', details: err.message });
  }
});

router.get('/users/:userId', async (req, res) => {
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

router.get('/users/:userId/tasks', async (req, res) => {
  try {
    const tasks = await getUserTasks(req.params.userId);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks', details: err.message });
  }
});

router.patch('/users/:userId', async (req, res) => {
  const targetId = req.params.userId;
  const body = req.body || {};
  const allowed = ['email', 'first_name', 'last_name', 'phone_number', 'timezone', 'is_admin'];
  const updates = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, k)) updates[k] = body[k];
  }
  try {
    const existing = await getUserById(targetId);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    if (updates.is_admin === false && existing.is_admin) {
      const n = await countAdminUsers();
      if (n <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last admin' });
      }
    }

    const updated = await updateUserByAdmin(targetId, updates);
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json(updated);
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    res.status(500).json({ error: 'Failed to update user', details: err.message });
  }
});

router.delete('/users/:userId', async (req, res) => {
  const targetId = req.params.userId;
  try {
    if (targetId === req.user.user_id) {
      return res.status(400).json({ error: 'Cannot delete your own account from here' });
    }
    const existing = await getUserById(targetId);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    if (existing.is_admin) {
      const n = await countAdminUsers();
      if (n <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin' });
      }
    }
    const row = await deleteUserById(targetId);
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user', details: err.message });
  }
});

export default router;
