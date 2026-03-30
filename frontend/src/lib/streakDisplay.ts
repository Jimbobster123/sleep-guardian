import type { User } from '@/contexts/AuthContext';

/** Streak count for the user’s current streak_type; falls back to legacy streak_days. */
export function streakDaysForUser(user: User | null | undefined): number {
  if (!user) return 0;
  if (user.streak_type === 'GOAL_MET') {
    return user.streak_days_goal_met ?? user.streak_days ?? 0;
  }
  return user.streak_days_recording ?? user.streak_days ?? 0;
}

/** For profile: daily-log streak when API only sent legacy fields. */
export function streakRecordingDisplay(user: User | null | undefined): number | null {
  if (!user) return null;
  if (user.streak_days_recording != null) return user.streak_days_recording;
  if (user.streak_type !== 'GOAL_MET' && user.streak_days != null) return user.streak_days;
  return null;
}

export function streakGoalMetDisplay(user: User | null | undefined): number | null {
  if (!user) return null;
  if (user.streak_days_goal_met != null) return user.streak_days_goal_met;
  if (user.streak_type === 'GOAL_MET' && user.streak_days != null) return user.streak_days;
  return null;
}
