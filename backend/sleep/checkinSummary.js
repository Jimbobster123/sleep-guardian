import { DateTime } from 'luxon';
import { listDailySleepLogsInRange } from '../queries.js';
import { resolveUserTimeZone } from './streak.js';

const MOOD_BASE = {
  exhausted: 20,
  tired: 40,
  okay: 60,
  good: 80,
  energized: 100,
};

function dateStr(logDate) {
  if (logDate == null) return '';
  if (typeof logDate === 'string') return logDate.slice(0, 10);
  if (logDate instanceof Date) return logDate.toISOString().slice(0, 10);
  return String(logDate).slice(0, 10);
}

/** 0–100 from mood, wake-ups, and optional latency (self-report). */
export function nightQualityScore(log) {
  const mood = String(log.mood || '').toLowerCase();
  let q = MOOD_BASE[mood];
  if (q == null) q = 55;

  const wakes = Math.max(0, Math.floor(Number(log.wake_up_count) || 0));
  q -= Math.min(20, wakes * 5);

  const lat = log.latency_minutes;
  if (lat === 60) q -= 6;
  else if (lat === 45) q -= 3;

  return Math.round(Math.max(0, Math.min(100, q)));
}

/**
 * Summaries from DailySleepLog rows (wake-up calendar day = log_date).
 * Sleep debt (7d): sum of max(0, goal − actual) per logged night in the window.
 */
export async function buildSleepCheckinSummary(userId, timezone) {
  const zone = resolveUserTimeZone(timezone);
  const today = DateTime.now().setZone(zone).startOf('day');
  const todayStr = today.toFormat('yyyy-MM-dd');
  const fromStr = today.minus({ days: 24 }).toFormat('yyyy-MM-dd');

  const rows = await listDailySleepLogsInRange(userId, fromStr, todayStr);
  const norm = rows.map((row) => {
    const d = dateStr(row.log_date);
    return {
      ...row,
      _d: d,
      goal: Number(row.sleep_goal_hours),
      actual: Number(row.actual_sleep_hours),
    };
  });

  const start7 = today.minus({ days: 6 }).toFormat('yyyy-MM-dd');
  const w7 = norm.filter((r) => r._d >= start7 && r._d <= todayStr);

  const sleepDebt7d = w7.reduce((sum, r) => sum + Math.max(0, r.goal - r.actual), 0);

  const avgTimeInBed =
    w7.length > 0 ? w7.reduce((sum, r) => sum + r.actual, 0) / w7.length : null;

  const avgQualityPct =
    w7.length > 0
      ? w7.reduce((sum, r) => sum + nightQualityScore(r), 0) / w7.length
      : null;

  const consistencyPct =
    w7.length > 0
      ? Math.round(
          (w7.filter((r) => Math.abs(r.actual - r.goal) <= 0.75).length / w7.length) * 100,
        )
      : null;

  const todayLog = norm.find((r) => r._d === todayStr);
  const latestLog =
    todayLog ||
    norm.reduce((best, r) => (!best || r._d > best._d ? r : best), null);

  const lastNight = latestLog
    ? {
        log_date: latestLog._d,
        time_in_bed_hours: Math.round(latestLog.actual * 100) / 100,
        goal_hours: Math.round(latestLog.goal * 10) / 10,
        quality_pct: nightQualityScore(latestLog),
        vs_goal_hours: Math.round((latestLog.actual - latestLog.goal) * 100) / 100,
      }
    : null;

  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = today.minus({ days: i }).toFormat('yyyy-MM-dd');
    const log = norm.find((r) => r._d === d);
    days.push(
      log
        ? {
            log_date: d,
            actual_sleep_hours: Math.round(log.actual * 100) / 100,
            sleep_goal_hours: Math.round(log.goal * 10) / 10,
            quality_pct: nightQualityScore(log),
            vs_goal_minutes: Math.round((log.actual - log.goal) * 60),
          }
        : {
            log_date: d,
            actual_sleep_hours: null,
            sleep_goal_hours: null,
            quality_pct: null,
            vs_goal_minutes: null,
          },
    );
  }

  return {
    timezone: zone,
    last_night: lastNight,
    rolling_7d: {
      nights_logged: w7.length,
      avg_time_in_bed_hours:
        avgTimeInBed != null ? Math.round(avgTimeInBed * 100) / 100 : null,
      avg_quality_pct: avgQualityPct != null ? Math.round(avgQualityPct) : null,
      sleep_debt_hours: Math.round(sleepDebt7d * 100) / 100,
      consistency_pct: consistencyPct,
      days,
    },
    definitions: {
      quality:
        'Estimated 0–100 from your morning mood, wake-ups, and time-to-sleep (when logged).',
      time_in_bed: 'Hours in bed from your check-in (bed to wake).',
      sleep_debt_7d:
        'Sum over the last 7 days of (goal hours − actual hours) when actual was below goal; only nights you logged count.',
    },
  };
}
