-- Migration 004: Add category to Task table
-- Safe to run multiple times.

ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS category VARCHAR(50);
