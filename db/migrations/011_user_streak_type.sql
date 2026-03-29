-- Streak mode: RECORDING (any daily log) vs GOAL_MET (actual sleep >= goal that day)

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS streak_type VARCHAR(20) NOT NULL DEFAULT 'RECORDING';

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS user_streak_type_check;
ALTER TABLE "User"
  ADD CONSTRAINT user_streak_type_check CHECK (streak_type IN ('RECORDING', 'GOAL_MET'));
