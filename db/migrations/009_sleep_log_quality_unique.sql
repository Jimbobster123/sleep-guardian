-- One log per user per wake night (sleep_date); optional self-reported quality.
ALTER TABLE "SleepLog" ADD COLUMN IF NOT EXISTS quality_rating SMALLINT
  CHECK (quality_rating IS NULL OR (quality_rating >= 1 AND quality_rating <= 5));

CREATE UNIQUE INDEX IF NOT EXISTS idx_sleep_log_user_sleep_date ON "SleepLog"(user_id, sleep_date);
