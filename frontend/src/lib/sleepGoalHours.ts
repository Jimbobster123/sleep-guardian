import { DateTime } from 'luxon';
import { formatWallTime12h } from '@/lib/calendarTime';

function apiDayOfWeek(dt: DateTime): number {
  return dt.weekday === 7 ? 0 : dt.weekday;
}

function parseTimeToMinutes(t: string | null | undefined): number | null {
  if (!t || typeof t !== 'string') return null;
  const m = t.trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

type GoalLike = {
  goal_type?: string;
  target_sleep_minutes?: number | null;
  target_bedtime?: string | null;
  target_wake_time?: string | null;
} | null;

type WindowLike = { day_of_week: number; start_time: string; end_time: string };

type SummaryLike = { goal: GoalLike; windows: WindowLike[] } | null;

/**
 * Hours target for the night that *starts* on `anchorDate` (calendar date in the user's zone).
 * Used for "last night" after wake-up (anchor = yesterday).
 */
export function estimateSleepGoalHoursForNightStartingOn(
  summary: SummaryLike,
  anchorDate: DateTime,
): number {
  const g = summary?.goal;
  if (g?.goal_type === 'fixed_duration' && g.target_sleep_minutes != null && g.target_sleep_minutes > 0) {
    return Math.round((Number(g.target_sleep_minutes) / 60) * 10) / 10;
  }
  const dow = apiDayOfWeek(anchorDate);
  const win = summary?.windows?.find((w) => Number(w.day_of_week) === dow);
  if (win?.start_time && win?.end_time) {
    const bed = parseTimeToMinutes(win.start_time);
    const wake = parseTimeToMinutes(win.end_time);
    if (bed != null && wake != null) {
      let mins = wake - bed;
      if (mins <= 0) mins += 24 * 60;
      return Math.round((mins / 60) * 10) / 10;
    }
  }
  if (g?.target_bedtime && g?.target_wake_time) {
    const bed = parseTimeToMinutes(g.target_bedtime);
    const wake = parseTimeToMinutes(g.target_wake_time);
    if (bed != null && wake != null) {
      let mins = wake - bed;
      if (mins <= 0) mins += 24 * 60;
      return Math.round((mins / 60) * 10) / 10;
    }
  }
  return 8;
}

/** Best-effort sleep duration in hours from sleep goal + today's window (profile timezone). */
export function estimateSleepGoalHoursForToday(
  summary: SummaryLike,
  zone: string,
): number {
  return estimateSleepGoalHoursForNightStartingOn(summary, DateTime.now().setZone(zone));
}

/** Target hours for the night before this morning's check-in (yesterday bed → today's wake). */
export function estimateSleepGoalHoursForLastNight(summary: SummaryLike, zone: string): number {
  const y = DateTime.now().setZone(zone).minus({ days: 1 });
  return estimateSleepGoalHoursForNightStartingOn(summary, y);
}

/**
 * Bed → wake labels for the night that started yesterday (local), from weekly windows or goal defaults.
 */
export function formatPreviousNightBedWakeRange(summary: SummaryLike, zone: string): string | null {
  const bedDate = DateTime.now().setZone(zone).minus({ days: 1 });
  const yesterdayDow = apiDayOfWeek(bedDate);
  const win = summary?.windows?.find((w) => Number(w.day_of_week) === yesterdayDow);
  if (win?.start_time && win?.end_time) {
    const a = formatWallTime12h(win.start_time);
    const b = formatWallTime12h(win.end_time);
    if (a && b) return `${a} – ${b}`;
  }
  const g = summary?.goal;
  if (g?.target_bedtime && g?.target_wake_time) {
    const a = formatWallTime12h(g.target_bedtime);
    const b = formatWallTime12h(g.target_wake_time);
    if (a && b) return `${a} – ${b}`;
  }
  return null;
}
