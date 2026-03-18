-- Luna Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User table
CREATE TABLE "User" (
  user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  timezone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sleep Goal table
CREATE TABLE "SleepGoal" (
  sleep_goal_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  target_bedtime TIME,
  target_wake_time TIME,
  bedtime_flex_minutes INTEGER,
  active BOOLEAN DEFAULT true,
  FOREIGN KEY (user_id) REFERENCES "User"(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_sleep_goal_user_id ON "SleepGoal"(user_id);

-- Sleep Window table
CREATE TABLE "SleepWindow" (
  sleep_window_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sleep_goal_id UUID NOT NULL,
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME,
  end_time TIME,
  FOREIGN KEY (sleep_goal_id) REFERENCES "SleepGoal"(sleep_goal_id) ON DELETE CASCADE
);

CREATE INDEX idx_sleep_window_sleep_goal_id ON "SleepWindow"(sleep_goal_id);

-- Reminder table
CREATE TABLE "Reminder" (
  reminder_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  type VARCHAR(100),
  minutes_before_bedtime INTEGER,
  enabled BOOLEAN DEFAULT true,
  FOREIGN KEY (user_id) REFERENCES "User"(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_reminder_user_id ON "Reminder"(user_id);

-- Task table
CREATE TABLE "Task" (
  task_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  notes TEXT,
  planned_datetime TIMESTAMP,
  due_datetime TIMESTAMP,
  priority INTEGER,
  status VARCHAR(50),
  estimated_minutes INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES "User"(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_task_user_id ON "Task"(user_id);

-- Calendar Event table
CREATE TABLE "CalendarEvent" (
  event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  task_id UUID,
  title VARCHAR(255),
  description TEXT,
  start_datetime TIMESTAMP,
  end_datetime TIMESTAMP,
  status VARCHAR(50),
  FOREIGN KEY (user_id) REFERENCES "User"(user_id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES "Task"(task_id) ON DELETE SET NULL
);

CREATE INDEX idx_calendar_event_user_id ON "CalendarEvent"(user_id);
CREATE INDEX idx_calendar_event_task_id ON "CalendarEvent"(task_id);

-- Sleep Protection Decision table
CREATE TABLE "SleepProtectionDecision" (
  decision_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL,
  overlaps_sleep_window BOOLEAN,
  flag_level VARCHAR(50),
  recommended_action VARCHAR(255),
  user_response VARCHAR(255),
  FOREIGN KEY (event_id) REFERENCES "CalendarEvent"(event_id) ON DELETE CASCADE
);

CREATE INDEX idx_sleep_protection_decision_event_id ON "SleepProtectionDecision"(event_id);

-- Sleep Suggestion table
CREATE TABLE "SleepSuggestion" (
  suggestion_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  suggested_bedtime TIMESTAMP,
  reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES "User"(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_sleep_suggestion_user_id ON "SleepSuggestion"(user_id);

-- Sleep Log table
CREATE TABLE "SleepLog" (
  sleep_log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  sleep_date DATE,
  bedtime_actual TIMESTAMP,
  wake_time_actual TIMESTAMP,
  sleep_duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES "User"(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_sleep_log_user_id ON "SleepLog"(user_id);
CREATE INDEX idx_sleep_log_sleep_date ON "SleepLog"(sleep_date);
