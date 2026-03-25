-- Migration 003: Add recurrence_series_id and category to Task table

ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS recurrence_series_id UUID,
  ADD COLUMN IF NOT EXISTS category VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_task_recurrence_series_id ON "Task"(recurrence_series_id);
