-- Migration 001: Auth sessions, calendar metadata, sleep goal modes
-- Safe to run multiple times (uses IF NOT EXISTS where possible).

-- Session-based auth (no JWT dependency)
CREATE TABLE IF NOT EXISTS "AuthSession" (
  session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  session_token VARCHAR(128) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES "User"(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_session_user_id ON "AuthSession"(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_session_token ON "AuthSession"(session_token);

-- Sleep goal mode/duration (goal_type drives scheduling behavior)
ALTER TABLE "SleepGoal"
  ADD COLUMN IF NOT EXISTS goal_type VARCHAR(32),
  ADD COLUMN IF NOT EXISTS target_sleep_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

-- Backfill goal_type/duration if missing (default to fixed bedtime/wake based on existing data)
UPDATE "SleepGoal"
SET goal_type = COALESCE(goal_type, 'fixed_bed_wake'),
    target_sleep_minutes = COALESCE(target_sleep_minutes, NULL),
    updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP);

-- Enforce goal_type values (via CHECK constraint; compatible with Postgres versions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sleepgoal_goal_type_check'
  ) THEN
    ALTER TABLE "SleepGoal"
      ADD CONSTRAINT sleepgoal_goal_type_check
      CHECK (goal_type IN ('fixed_bedtime', 'fixed_wake_time', 'fixed_duration', 'fixed_bed_wake'));
  END IF;
END $$;

-- Calendar event metadata for imports
ALTER TABLE "CalendarEvent"
  ADD COLUMN IF NOT EXISTS source VARCHAR(32),
  ADD COLUMN IF NOT EXISTS external_uid VARCHAR(255),
  ADD COLUMN IF NOT EXISTS is_all_day BOOLEAN;

UPDATE "CalendarEvent"
SET source = COALESCE(source, 'manual'),
    is_all_day = COALESCE(is_all_day, false);

CREATE INDEX IF NOT EXISTS idx_calendar_event_external_uid ON "CalendarEvent"(external_uid);

