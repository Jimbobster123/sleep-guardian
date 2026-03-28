-- Migration 008: Bedtime reminder delivery contact fields and send tracking

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32);

-- method may be missing if DB was created before migration 007; keep 008 safe to run alone.
ALTER TABLE "Reminder"
  ADD COLUMN IF NOT EXISTS method VARCHAR(32);

ALTER TABLE "Reminder"
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMP;

UPDATE "Reminder"
SET method = COALESCE(NULLIF(method, ''), 'email')
WHERE type = 'bedtime';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reminder_method_check'
  ) THEN
    ALTER TABLE "Reminder"
      ADD CONSTRAINT reminder_method_check
      CHECK (method IS NULL OR method IN ('email', 'text_message'));
  END IF;
END $$;
