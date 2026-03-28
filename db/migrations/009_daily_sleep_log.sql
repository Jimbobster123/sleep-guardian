-- Migration 009: daily sleep check-in / sleep log (one row per user per calendar day)
-- Apply in production after deploy. Safe to run multiple times.

CREATE TABLE IF NOT EXISTS "DailySleepLog" (
  daily_sleep_log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  sleep_goal_hours DOUBLE PRECISION NOT NULL,
  actual_sleep_hours DOUBLE PRECISION NOT NULL,
  wake_up_count INTEGER NOT NULL DEFAULT 0,
  mood VARCHAR(50) NOT NULL,
  factors TEXT[] NOT NULL DEFAULT '{}',
  latency_minutes INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT daily_sleep_log_user_date UNIQUE (user_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_sleep_log_user_date ON "DailySleepLog"(user_id, log_date DESC);
