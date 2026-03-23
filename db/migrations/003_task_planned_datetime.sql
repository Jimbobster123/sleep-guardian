-- Migration 003: Add planned_datetime to Task table
-- Safe to run multiple times (uses IF NOT EXISTS).

ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS planned_datetime TIMESTAMP;
