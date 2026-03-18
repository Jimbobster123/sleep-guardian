import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getUserBySessionToken } from '../queries.js';
import { createGoogleAuthUrl, handleGoogleOAuthCallback, syncGoogleToLocal } from '../google/calendar.js';

const router = express.Router();

router.get('/auth-url', requireAuth, (req, res) => {
  try {
    const url = createGoogleAuthUrl(req.sessionToken);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create Google auth URL', details: err.message });
  }
});

router.get('/oauth2callback', async (req, res) => {
  try {
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    if (!code || !state) return res.status(400).send('Missing code or state');

    const user = await getUserBySessionToken(state);
    if (!user) return res.status(400).send('Invalid session');

    await handleGoogleOAuthCallback(code, user.user_id);

    const now = new Date();
    const timeMin = now.toISOString();
    const inSixMonths = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    const timeMax = inSixMonths.toISOString();
    await syncGoogleToLocal({ user, timeMin, timeMax });

    const redirectBase = process.env.FRONTEND_URL || 'http://localhost:8080';
    res.redirect(`${redirectBase}/profile?google=connected`);
  } catch (err) {
    res.status(500).send('Google OAuth failed: ' + err.message);
  }
});

router.post('/sync', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { timeMin, timeMax } = req.body || {};
    const now = new Date();
    const min = timeMin || now.toISOString();
    const inSixMonths = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    const max = timeMax || inSixMonths.toISOString();
    const result = await syncGoogleToLocal({ user, timeMin: min, timeMax: max });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Google sync failed', details: err.message });
  }
});

export default router;

