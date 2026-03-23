-- Migration 005: Remove task due-date calendar events
-- Tasks now only appear on the calendar when they have a planned time, not a due date.

DELETE FROM "CalendarEvent" WHERE source = 'task_due';
