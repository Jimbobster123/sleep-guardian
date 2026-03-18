import express from 'express';
import crypto from 'crypto';
import { hashPassword, verifyPassword } from '../auth/password.js';
import pool from '../db.js';
import { createSession, createUser, getUserByEmail, revokeSession } from '../queries.js';

const router = express.Router();

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function passwordMeetsMinimum(password) {
  return typeof password === 'string' && password.length >= 8;
}

function newSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function sessionExpiryDate() {
  const days = Number(process.env.SESSION_TTL_DAYS || 30);
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

router.post('/signup', async (req, res) => {
  const client = await pool.connect();
  try {
    const { email, password, firstName, lastName, timezone } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) return res.status(400).json({ error: 'Invalid email' });
    if (!passwordMeetsMinimum(password)) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    await client.query('BEGIN');

    const existing = await getUserByEmail(normalizedEmail);
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const password_hash = await hashPassword(password);
    const userInsert = await client.query(
      `INSERT INTO "User" (email, password_hash, first_name, last_name, timezone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, email, first_name, last_name, timezone, created_at`,
      [
        normalizedEmail,
        password_hash,
        firstName?.trim?.() ? firstName : null,
        lastName?.trim?.() ? lastName : null,
        timezone?.trim?.() ? timezone : null,
      ]
    );
    const user = userInsert.rows[0];

    const session_token = newSessionToken();
    const expires_at = sessionExpiryDate();
    await client.query(
      `INSERT INTO "AuthSession" (user_id, session_token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.user_id, session_token, expires_at]
    );

    await client.query('COMMIT');

    res.json({ token: session_token, user });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    res.status(500).json({ error: 'Signup failed', details: err.message });
  } finally {
    client.release();
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) return res.status(400).json({ error: 'Invalid email' });
    if (typeof password !== 'string') return res.status(400).json({ error: 'Invalid password' });

    const userRecord = await getUserByEmail(normalizedEmail);
    if (!userRecord) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await verifyPassword(password, userRecord.password_hash);
    if (!ok) {
      const hash = String(userRecord.password_hash || '');
      if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
        return res.status(401).json({
          error: 'Invalid credentials',
          details: 'This user appears to be from seed data with placeholder bcrypt hashes. Create a new account or reseed with real hashes.',
        });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const session_token = newSessionToken();
    const expires_at = sessionExpiryDate();
    await createSession({ userId: userRecord.user_id, sessionToken: session_token, expiresAt: expires_at });

    const user = {
      user_id: userRecord.user_id,
      email: userRecord.email,
      first_name: userRecord.first_name,
      last_name: userRecord.last_name,
      timezone: userRecord.timezone,
    };
    res.json({ token: session_token, user });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    if (token) await revokeSession(token);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed', details: err.message });
  }
});

export default router;

