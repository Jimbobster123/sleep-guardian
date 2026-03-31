import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { getOnboardingSleepGoalReminderPercentage } from '../queries.js';

const router = express.Router();

// OKR Metric:
// Percentage of new users who, within their first 7 days after sign-up,
// set BOTH a sleep goal and at least one enabled sleep reminder.
router.get('/onboarding-sleep-goal-reminder-7d', requireAuth, requireAdmin, async (req, res) => {
  try {
    const data = await getOnboardingSleepGoalReminderPercentage({ intervalDays: 7 });
    res.json(data);
  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch onboarding OKR metric',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;

