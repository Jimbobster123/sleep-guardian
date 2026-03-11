import { getUserBySessionToken } from '../queries.js';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const user = await getUserBySessionToken(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    req.user = user;
    req.sessionToken = token;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Auth error', details: err.message });
  }
}

