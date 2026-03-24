-- Migration 006: add recurrence series IDs for tasks and calendar events
-- Safe to run multiple times.

ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS recurrence_series_id UUID;

ALTER TABLE "CalendarEvent"
  ADD COLUMN IF NOT EXISTS recurrence_series_id UUID;

CREATE INDEX IF NOT EXISTS idx_task_recurrence_series_id ON "Task"(recurrence_series_id);
CREATE INDEX IF NOT EXISTS idx_calendar_event_recurrence_series_id ON "CalendarEvent"(recurrence_series_id);
