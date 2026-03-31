export function requireAdmin(req, res, next) {
  if (req.user?.is_admin !== true) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}
