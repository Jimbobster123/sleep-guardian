-- Migration 007: Timestamp columns for onboarding OKR metrics
--
-- We need to evaluate whether a new user set:
-- 1) a sleep goal
-- 2) at least one enabled sleep reminder
-- within their first N days after sign-up.

-- Add created_at timestamps (if missing)
ALTER TABLE "SleepGoal"
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;

ALTER TABLE "Reminder"
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS method VARCHAR(32);

-- Backfill created_at for seeded/existing rows:
-- Use "User.created_at + 1 day" as a best-effort approximation so the
-- onboarding metric works immediately after migration.
UPDATE "SleepGoal" sg
SET created_at = u.created_at + interval '1 day'
FROM "User" u
WHERE sg.created_at IS NULL
  AND sg.user_id = u.user_id;

UPDATE "Reminder" r
SET created_at = u.created_at + interval '1 day'
FROM "User" u
WHERE r.created_at IS NULL
  AND r.user_id = u.user_id;

UPDATE "Reminder"
SET method = COALESCE(NULLIF(method, ''), 'email')
WHERE type = 'bedtime';

-- Final fallback (in case any legacy rows have NULL user.created_at)
UPDATE "SleepGoal"
SET created_at = CURRENT_TIMESTAMP
WHERE created_at IS NULL;

UPDATE "Reminder"
SET created_at = CURRENT_TIMESTAMP
WHERE created_at IS NULL;

-- Ensure future inserts auto-populate
ALTER TABLE "SleepGoal"
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Reminder"
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

-- Indexes to keep the OKR query fast
CREATE INDEX IF NOT EXISTS idx_sleep_goal_user_created_at
  ON "SleepGoal"(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_reminder_user_created_at
  ON "Reminder"(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_user_created_at
  ON "User"(created_at);

