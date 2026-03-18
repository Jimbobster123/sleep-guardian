-- Migration 002: Google Calendar sync fields

-- Per-user Google integration
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS google_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_id VARCHAR(255);

-- Per-event Google mapping
ALTER TABLE "CalendarEvent"
  ADD COLUMN IF NOT EXISTS google_event_id VARCHAR(255);

