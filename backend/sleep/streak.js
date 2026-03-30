import { DateTime } from 'luxon';
import { getUserById, listDailySleepLogsInRange } from '../queries.js';

/** @typedef {'RECORDING' | 'GOAL_MET'} StreakType */

/**
 * @param {unknown} v
 * @returns {'RECORDING' | 'GOAL_MET'}
 */
export function normalizeStreakType(v) {
  const s = String(v ?? '').toUpperCase();
  return s === 'GOAL_MET' ? 'GOAL_MET' : 'RECORDING';
}

/** IANA zone from profile, or UTC if missing / invalid (invalid zones would break SQL date params). */
export function resolveUserTimeZone(timezone) {
  const raw = timezone && String(timezone).trim() ? String(timezone).trim() : 'UTC';
  const probe = DateTime.now().setZone(raw);
  return probe.isValid ? raw : 'UTC';
}

/**
 * Same priority as frontend `effectiveTimeZone`: valid profile tz wins, else client hint (browser), else UTC.
 * Streak must use this so `log_date` (saved with client calendar) matches streak "today".
 */
export function resolveStreakTimeZone(profileTimezone, clientHint) {
  const p = profileTimezone && String(profileTimezone).trim() ? String(profileTimezone).trim() : '';
  if (p && DateTime.now().setZone(p).isValid) return p;
  const h = clientHint && String(clientHint).trim() ? String(clientHint).trim() : '';
  if (h && DateTime.now().setZone(h).isValid) return h;
  return 'UTC';
}

/**
 * Last calendar day (in streak zone) that can end the streak chain. Always "today" in that zone.
 * Whether *today* must be logged yet is handled by anchor grace in `countStreakBackward` (if no row for
 * today, we anchor on yesterday). Using "yesterday" here as the end date (old wake-time rule) made
 * same-day logs invisible to the streak when saved before the planned wake time.
 * @param {string} zone
 */
function getEffectiveStreakEndDate(zone) {
  return DateTime.now().setZone(zone).startOf('day');
}

/**
 * @param {import('luxon').DateTime} d
 */
function toYmd(d) {
  return d.toFormat('yyyy-MM-dd');
}

/**
 * @param {Map<string, object>} byDate
 * @param {'RECORDING' | 'GOAL_MET'} type
 * @param {string} ymd
 */
function rowQualifies(byDate, type, ymd) {
  const row = byDate.get(ymd);
  if (!row) return false;
  if (type === 'RECORDING') return true;
  const actual = Number(row.actual_sleep_hours);
  const goal = Number(row.sleep_goal_hours);
  return Number.isFinite(actual) && Number.isFinite(goal) && actual + 1e-9 >= goal;
}

/**
 * @param {Map<string, object>} byDate
 * @param {import('luxon').DateTime} effectiveEnd startOf day
 * @param {'RECORDING' | 'GOAL_MET'} type
 */
function countStreakBackward(byDate, effectiveEnd, type) {
  const endStr = toYmd(effectiveEnd);
  let anchor = effectiveEnd;
  if (!rowQualifies(byDate, type, endStr)) {
    anchor = effectiveEnd.minus({ days: 1 });
  }

  let count = 0;
  for (let i = 0; i < 400; i += 1) {
    const d = anchor.minus({ days: i }).toFormat('yyyy-MM-dd');
    const row = byDate.get(d);
    if (!row) break;
    if (type === 'RECORDING') {
      count += 1;
    } else {
      const actual = Number(row.actual_sleep_hours);
      const goal = Number(row.sleep_goal_hours);
      if (Number.isFinite(actual) && Number.isFinite(goal) && actual + 1e-9 >= goal) {
        count += 1;
      } else {
        break;
      }
    }
  }
  return count;
}

/**
 * @param {string} userId
 * @param {string} zone
 * @returns {Promise<Map<string, object>>}
 */
async function loadLogMapThroughEffectiveEnd(userId, zone) {
  const effectiveEnd = getEffectiveStreakEndDate(zone);
  const from = effectiveEnd.minus({ days: 400 }).toFormat('yyyy-MM-dd');
  const toInclusive = effectiveEnd.plus({ days: 1 }).toFormat('yyyy-MM-dd');
  const rows = await listDailySleepLogsInRange(userId, from, toInclusive);
  const byDate = new Map();
  for (const r of rows) {
    const d = typeof r.log_date === 'string' ? r.log_date.slice(0, 10) : String(r.log_date).slice(0, 10);
    byDate.set(d, r);
  }
  return { byDate, effectiveEnd };
}

/**
 * Consecutive days ending at calendar "today" in the streak zone (with anchor grace if today has no row yet).
 * RECORDING: day counts if any log exists. GOAL_MET: day counts if actual_sleep_hours >= sleep_goal_hours.
 *
 * @param {string} userId
 * @param {'RECORDING' | 'GOAL_MET'} streakType
 * @param {string | null | undefined} profileTimezone
 * @param {string | null | undefined} clientTimezoneHint
 * @returns {Promise<number>}
 */
export async function calculateCurrentStreak(userId, streakType, profileTimezone, clientTimezoneHint) {
  const { recording, goalMet } = await calculateBothStreaks(userId, profileTimezone, clientTimezoneHint);
  const type = normalizeStreakType(streakType);
  return type === 'GOAL_MET' ? goalMet : recording;
}

/**
 * Both streak modes for the user (same consecutive-day logic; rules differ per day).
 * @param {string} userId
 * @param {string | null | undefined} profileTimezone
 * @param {string | null | undefined} clientTimezoneHint
 * @returns {Promise<{ recording: number, goalMet: number }>}
 */
export async function calculateBothStreaks(userId, profileTimezone, clientTimezoneHint) {
  const zone = resolveStreakTimeZone(profileTimezone, clientTimezoneHint);
  const { byDate, effectiveEnd } = await loadLogMapThroughEffectiveEnd(userId, zone);
  return {
    recording: countStreakBackward(byDate, effectiveEnd, 'RECORDING'),
    goalMet: countStreakBackward(byDate, effectiveEnd, 'GOAL_MET'),
  };
}

/**
 * Full user profile fields for /api/me plus computed streaks.
 * @param {string} userId
 * @param {string | null | undefined} clientTimezoneHint from `X-Client-Timezone` (browser); aligns streak with saved log dates.
 */
export async function getMeUserPayload(userId, clientTimezoneHint) {
  const user = await getUserById(userId);
  if (!user) return null;
  const streakType = normalizeStreakType(user.streak_type);
  let streak_days = 0;
  let streak_days_recording = 0;
  let streak_days_goal_met = 0;
  try {
    const both = await calculateBothStreaks(userId, user.timezone, clientTimezoneHint);
    streak_days_recording = both.recording;
    streak_days_goal_met = both.goalMet;
    streak_days = streakType === 'GOAL_MET' ? streak_days_goal_met : streak_days_recording;
  } catch (err) {
    console.error('calculateBothStreaks failed for user', userId, err);
  }
  return {
    ...user,
    streak_type: streakType,
    streak_days,
    streak_days_recording,
    streak_days_goal_met,
  };
}
