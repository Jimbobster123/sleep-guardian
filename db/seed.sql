-- Luna Database Seed Data
-- Sample users for testing and development

INSERT INTO "User" (user_id, email, password_hash, first_name, last_name, timezone, created_at) VALUES
  (
    '550e8400-e29b-41d4-a716-446655440001',
    'alex.johnson@example.com',
    '$2b$10$YIXdX5EGXzJ5Z8Ks9Y8vS.Kqt5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y',
    'Alex',
    'Johnson',
    'America/New_York',
    '2025-01-15 10:30:00'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440002',
    'marie.dubois@example.com',
    '$2b$10$ZJYeY6FHYaK9A9Lt0Z9wT.Lru6Z6Z6Z6Z6Z6Z6Z6Z6Z6Z6Z6Z6Z6Z',
    'Marie',
    'Dubois',
    'Europe/Paris',
    '2025-01-16 14:15:00'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440003',
    'james.chen@example.com',
    '$2b$10$AKZfZ7GIZbL0B0Mu1A0xU.MsvA7A7A7A7A7A7A7A7A7A7A7A7A7A7',
    'James',
    'Chen',
    'Asia/Tokyo',
    '2025-01-17 08:45:00'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440004',
    'sara.martinez@example.com',
    '$2b$10$BLAgA8HJAcM1C1Nv2B1yV.Ntw8B8B8B8B8B8B8B8B8B8B8B8B8B8',
    'Sara',
    'Martinez',
    'America/Los_Angeles',
    '2025-01-18 16:20:00'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440005',
    'priya.patel@example.com',
    '$2b$10$CMBhB9IKBdN2D2Ow3C2zW.OuxC9C9C9C9C9C9C9C9C9C9C9C9C9C9',
    'Priya',
    'Patel',
    'Asia/Mumbai',
    '2025-01-19 12:00:00'
  );

-- Note: Password hashes above are placeholders. In production:
-- 1. Use bcrypt (or similar) to hash passwords
-- 2. Never store plain text passwords
-- 3. Use a proper password hashing library in your application

-- Sleep Goals (one per user)
INSERT INTO "SleepGoal" (sleep_goal_id, user_id, target_bedtime, target_wake_time, bedtime_flex_minutes, active) VALUES
  ('650e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '23:00:00', '07:00:00', 30, true),
  ('650e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002', '22:30:00', '06:30:00', 15, true),
  ('650e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440003', '23:30:00', '07:30:00', 45, true),
  ('650e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440004', '22:00:00', '06:00:00', 20, true),
  ('650e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440005', '22:15:00', '06:45:00', 30, true);

-- Sleep Windows (weekday windows for sleep goals)
INSERT INTO "SleepWindow" (sleep_window_id, sleep_goal_id, day_of_week, start_time, end_time) VALUES
  -- Alex's windows (Monday-Friday)
  ('750e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440001', 1, '22:30:00', '07:30:00'),
  ('750e8400-e29b-41d4-a716-446655440002', '650e8400-e29b-41d4-a716-446655440001', 2, '22:30:00', '07:30:00'),
  ('750e8400-e29b-41d4-a716-446655440003', '650e8400-e29b-41d4-a716-446655440001', 3, '22:30:00', '07:30:00'),
  ('750e8400-e29b-41d4-a716-446655440004', '650e8400-e29b-41d4-a716-446655440001', 4, '22:30:00', '07:30:00'),
  ('750e8400-e29b-41d4-a716-446655440005', '650e8400-e29b-41d4-a716-446655440001', 5, '22:30:00', '07:30:00'),
  -- Marie's windows (Tuesday-Saturday)
  ('750e8400-e29b-41d4-a716-446655440006', '650e8400-e29b-41d4-a716-446655440002', 2, '22:00:00', '07:00:00'),
  ('750e8400-e29b-41d4-a716-446655440007', '650e8400-e29b-41d4-a716-446655440002', 3, '22:00:00', '07:00:00'),
  ('750e8400-e29b-41d4-a716-446655440008', '650e8400-e29b-41d4-a716-446655440002', 4, '22:00:00', '07:00:00'),
  ('750e8400-e29b-41d4-a716-446655440009', '650e8400-e29b-41d4-a716-446655440002', 5, '22:00:00', '07:00:00'),
  ('750e8400-e29b-41d4-a716-446655440010', '650e8400-e29b-41d4-a716-446655440002', 6, '22:00:00', '07:00:00'),
  -- James's windows (Sunday-Thursday)
  ('750e8400-e29b-41d4-a716-446655440011', '650e8400-e29b-41d4-a716-446655440003', 0, '23:00:00', '08:00:00'),
  ('750e8400-e29b-41d4-a716-446655440012', '650e8400-e29b-41d4-a716-446655440003', 1, '23:00:00', '08:00:00'),
  ('750e8400-e29b-41d4-a716-446655440013', '650e8400-e29b-41d4-a716-446655440003', 2, '23:00:00', '08:00:00'),
  ('750e8400-e29b-41d4-a716-446655440014', '650e8400-e29b-41d4-a716-446655440003', 3, '23:00:00', '08:00:00'),
  ('750e8400-e29b-41d4-a716-446655440015', '650e8400-e29b-41d4-a716-446655440003', 4, '23:00:00', '08:00:00'),
  -- Sara's windows (Monday-Friday)
  ('750e8400-e29b-41d4-a716-446655440016', '650e8400-e29b-41d4-a716-446655440004', 1, '21:30:00', '06:30:00'),
  ('750e8400-e29b-41d4-a716-446655440017', '650e8400-e29b-41d4-a716-446655440004', 2, '21:30:00', '06:30:00'),
  ('750e8400-e29b-41d4-a716-446655440018', '650e8400-e29b-41d4-a716-446655440004', 3, '21:30:00', '06:30:00'),
  ('750e8400-e29b-41d4-a716-446655440019', '650e8400-e29b-41d4-a716-446655440004', 4, '21:30:00', '06:30:00'),
  ('750e8400-e29b-41d4-a716-446655440020', '650e8400-e29b-41d4-a716-446655440004', 5, '21:30:00', '06:30:00'),
  -- Priya's windows (Monday-Friday)
  ('750e8400-e29b-41d4-a716-446655440021', '650e8400-e29b-41d4-a716-446655440005', 1, '21:45:00', '07:15:00'),
  ('750e8400-e29b-41d4-a716-446655440022', '650e8400-e29b-41d4-a716-446655440005', 2, '21:45:00', '07:15:00'),
  ('750e8400-e29b-41d4-a716-446655440023', '650e8400-e29b-41d4-a716-446655440005', 3, '21:45:00', '07:15:00'),
  ('750e8400-e29b-41d4-a716-446655440024', '650e8400-e29b-41d4-a716-446655440005', 4, '21:45:00', '07:15:00'),
  ('750e8400-e29b-41d4-a716-446655440025', '650e8400-e29b-41d4-a716-446655440005', 5, '21:45:00', '07:15:00');

-- Reminders (bedtime reminders for each user)
INSERT INTO "Reminder" (reminder_id, user_id, type, minutes_before_bedtime, enabled) VALUES
  ('850e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'bedtime', 30, true),
  ('850e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'wakeup', 0, true),
  ('850e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440002', 'bedtime', 45, true),
  ('850e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440002', 'wakeup', 10, true),
  ('850e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440003', 'bedtime', 60, true),
  ('850e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440004', 'bedtime', 20, true),
  ('850e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440004', 'wakeup', 15, false),
  ('850e8400-e29b-41d4-a716-446655440008', '550e8400-e29b-41d4-a716-446655440005', 'bedtime', 30, true),
  ('850e8400-e29b-41d4-a716-446655440009', '550e8400-e29b-41d4-a716-446655440005', 'wakeup', 5, true);

-- Tasks (various tasks for users)
INSERT INTO "Task" (task_id, user_id, title, notes, due_datetime, priority, status, estimated_minutes, created_at) VALUES
  -- Alex's tasks
  ('950e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'Complete project report', 'Finish Q1 analysis', '2025-02-20 17:00:00', 1, 'pending', 120, '2025-02-10 09:00:00'),
  ('950e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'Team meeting prep', 'Review agenda and slides', '2025-02-19 14:00:00', 2, 'in_progress', 45, '2025-02-10 10:00:00'),
  ('950e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001', 'Gym session', 'Cardio and weights', '2025-02-18 18:00:00', 3, 'pending', 60, '2025-02-15 08:00:00'),
  -- Marie's tasks
  ('950e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440002', 'Client presentation', 'Prepare slides and handouts', '2025-02-21 10:00:00', 1, 'pending', 180, '2025-02-12 14:00:00'),
  ('950e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440002', 'Code review', 'Review pull requests', '2025-02-19 16:00:00', 2, 'in_progress', 90, '2025-02-13 09:00:00'),
  -- James's tasks
  ('950e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440003', 'Write blog post', 'Sleep hygiene tips', '2025-02-25 12:00:00', 2, 'pending', 120, '2025-02-14 11:00:00'),
  ('950e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440003', 'Respond to emails', 'Clear inbox', '2025-02-18 09:00:00', 3, 'completed', 30, '2025-02-15 08:00:00'),
  -- Sara's tasks
  ('950e8400-e29b-41d4-a716-446655440008', '550e8400-e29b-41d4-a716-446655440004', 'Design mockups', 'Mobile app interface', '2025-02-22 15:00:00', 1, 'pending', 240, '2025-02-11 13:00:00'),
  ('950e8400-e29b-41d4-a716-446655440009', '550e8400-e29b-41d4-a716-446655440004', 'Update documentation', 'API docs', '2025-02-20 17:00:00', 2, 'in_progress', 60, '2025-02-13 10:00:00'),
  -- Priya's tasks
  ('950e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440005', 'Budget planning', 'Q2 expenses', '2025-02-28 18:00:00', 1, 'pending', 150, '2025-02-10 14:00:00'),
  ('950e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440005', 'One-on-one meetings', 'Team check-ins', '2025-02-19 10:00:00', 2, 'in_progress', 45, '2025-02-14 09:00:00');

-- Calendar Events (events with and without associated tasks)
INSERT INTO "CalendarEvent" (event_id, user_id, task_id, title, description, start_datetime, end_datetime, status) VALUES
  -- Alex's events
  ('a50e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '950e8400-e29b-41d4-a716-446655440002', 'Team meeting prep', 'Meet with team', '2025-02-19 13:00:00', '2025-02-19 14:30:00', 'scheduled'),
  ('a50e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', NULL, 'Doctor appointment', 'Annual checkup', '2025-02-20 10:00:00', '2025-02-20 11:00:00', 'scheduled'),
  ('a50e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001', '950e8400-e29b-41d4-a716-446655440003', 'Evening workout', 'Gym routine', '2025-02-18 17:30:00', '2025-02-18 18:45:00', 'scheduled'),
  -- Marie's events
  ('a50e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440002', '950e8400-e29b-41d4-a716-446655440004', 'Client presentation', 'Important demo', '2025-02-21 09:00:00', '2025-02-21 11:00:00', 'scheduled'),
  ('a50e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440002', NULL, 'Dinner with friends', 'Social event', '2025-02-18 19:00:00', '2025-02-18 22:00:00', 'scheduled'),
  -- James's events
  ('a50e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440003', '950e8400-e29b-41d4-a716-446655440006', 'Blog writing', 'Content creation', '2025-02-22 14:00:00', '2025-02-22 16:00:00', 'scheduled'),
  ('a50e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440003', NULL, 'Late night gaming', 'Online tournament', '2025-02-20 21:00:00', '2025-02-21 00:30:00', 'scheduled'),
  -- Sara's events
  ('a50e8400-e29b-41d4-a716-446655440008', '550e8400-e29b-41d4-a716-446655440004', '950e8400-e29b-41d4-a716-446655440008', 'Design session', 'Mockup review', '2025-02-20 13:00:00', '2025-02-20 15:00:00', 'scheduled'),
  ('a50e8400-e29b-41d4-a716-446655440009', '550e8400-e29b-41d4-a716-446655440004', NULL, 'Project kickoff', 'New client project', '2025-02-19 10:00:00', '2025-02-19 11:30:00', 'scheduled'),
  -- Priya's events
  ('a50e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440005', '950e8400-e29b-41d4-a716-446655440011', 'Team meeting', 'Monthly sync', '2025-02-19 09:00:00', '2025-02-19 10:00:00', 'scheduled'),
  ('a50e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440005', NULL, 'Late evening event', 'Company social', '2025-02-22 20:00:00', '2025-02-22 23:00:00', 'scheduled');

-- Sleep Protection Decisions (decisions for conflicting events)
INSERT INTO "SleepProtectionDecision" (decision_id, event_id, overlaps_sleep_window, flag_level, recommended_action, user_response) VALUES
  ('b50e8400-e29b-41d4-a716-446655440001', 'a50e8400-e29b-41d4-a716-446655440005', true, 'warning', 'Reschedule or end early', 'acknowledged'),
  ('b50e8400-e29b-41d4-a716-446655440002', 'a50e8400-e29b-41d4-a716-446655440007', true, 'critical', 'Highly recommend ending before 23:30', 'postponed_event'),
  ('b50e8400-e29b-41d4-a716-446655440003', 'a50e8400-e29b-41d4-a716-446655440011', true, 'warning', 'End earlier for better sleep', 'noted');

-- Sleep Suggestions (AI-generated suggestions for users)
INSERT INTO "SleepSuggestion" (suggestion_id, user_id, suggested_bedtime, reason, created_at) VALUES
  ('c50e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '2025-02-18 22:45:00', 'Based on recent sleep patterns and upcoming early meeting', '2025-02-18 20:00:00'),
  ('c50e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002', '2025-02-18 22:15:00', 'You need extra rest after late night yesterday', '2025-02-18 19:30:00'),
  ('c50e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440003', '2025-02-19 23:00:00', 'Gaming event scheduled - try to sleep early next day', '2025-02-18 21:00:00'),
  ('c50e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440004', '2025-02-18 21:30:00', 'Heavy workload this week - prioritize rest', '2025-02-18 18:00:00'),
  ('c50e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440005', '2025-02-19 22:00:00', 'Consistent schedule maintenance recommended', '2025-02-18 20:30:00');

-- Sleep Logs (actual sleep data for users)
INSERT INTO "SleepLog" (sleep_log_id, user_id, sleep_date, bedtime_actual, wake_time_actual, sleep_duration_minutes, notes, created_at) VALUES
  -- Alex's sleep logs
  ('d50e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '2025-02-17', '2025-02-17 23:10:00', '2025-02-18 07:05:00', 475, 'Good sleep, mild interruption at 3 AM', '2025-02-18 08:00:00'),
  ('d50e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', '2025-02-16', '2025-02-16 22:55:00', '2025-02-17 07:00:00', 485, 'Excellent sleep quality', '2025-02-17 08:00:00'),
  -- Marie's sleep logs
  ('d50e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440002', '2025-02-17', '2025-02-17 22:20:00', '2025-02-18 06:45:00', 445, 'Felt restless, maybe too much coffee', '2025-02-18 07:30:00'),
  ('d50e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440002', '2025-02-16', '2025-02-16 22:10:00', '2025-02-17 06:30:00', 500, 'Very good sleep', '2025-02-17 07:30:00'),
  -- James's sleep logs
  ('d50e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440003', '2025-02-17', '2025-02-17 23:45:00', '2025-02-18 08:15:00', 510, 'Good recovery after busy day', '2025-02-18 09:00:00'),
  ('d50e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440003', '2025-02-15', '2025-02-15 23:30:00', '2025-02-16 08:00:00', 510, 'Normal sleep pattern', '2025-02-16 09:00:00'),
  -- Sara's sleep logs
  ('d50e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440004', '2025-02-17', '2025-02-17 21:50:00', '2025-02-18 06:10:00', 500, 'Solid night', '2025-02-18 07:00:00'),
  ('d50e8400-e29b-41d4-a716-446655440008', '550e8400-e29b-41d4-a716-446655440004', '2025-02-16', '2025-02-16 21:40:00', '2025-02-17 06:00:00', 500, 'Good sleep', '2025-02-17 07:00:00'),
  -- Priya's sleep logs
  ('d50e8400-e29b-41d4-a716-446655440009', '550e8400-e29b-41d4-a716-446655440005', '2025-02-17', '2025-02-17 22:10:00', '2025-02-18 06:50:00', 500, 'Consistent sleep schedule', '2025-02-18 08:00:00'),
  ('d50e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440005', '2025-02-16', '2025-02-16 22:05:00', '2025-02-17 06:45:00', 500, 'Regular sleep', '2025-02-17 08:00:00');
