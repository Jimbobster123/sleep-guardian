import { DateTime } from 'luxon';
import { getActiveSleepGoal, getSleepWindows, listUserSleepLogs } from '../queries.js';

function luxonToApiDow(dt) {
  const w = dt.weekday;
  return w === 7 ? 0 : w;
}

function parseHhMmSsToMinutes(t) {
  if (!t || typeof t !== 'string') return null;
  const parts = t.trim().split(':').map((x) => Number(x));
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return null;
  const [hh, mm, ss = 0] = parts;
  return hh * 60 + mm + Math.round(ss / 60);
}

function windowForDow(windows, dow) {
  return windows.find((w) => Number(w.day_of_week) === dow) || null;
}

function goalSleepHours(goal, windows) {
  if (!goal) return 8;
  if (goal.goal_type === 'fixed_duration' && goal.target_sleep_minutes != null) {
    return Math.max(0.5, Number(goal.target_sleep_minutes) / 60);
  }
  const w0 = windows[0];
  const bed = parseHhMmSsToMinutes(String(goal.target_bedtime || w0?.start_time || '23:00:00'));
  const wake = parseHhMmSsToMinutes(String(goal.target_wake_time || w0?.end_time || '07:00:00'));
  if (bed == null || wake == null) return 8;
  let wakeM = wake;
  if (wakeM <= bed) wakeM += 24 * 60;
  return Math.max(0.5, (wakeM - bed) / 60);
}

function bedtimeDeviationMinutes(bedtimeWall, sleepDateStr, zone, windows, goal) {
  let bed = DateTime.fromSQL(bedtimeWall.replace('T', ' '), { zone });
  if (!bed.isValid) {
    bed = DateTime.fromFormat(bedtimeWall, 'yyyy-MM-dd HH:mm:ss', { zone });
  }
  if (!bed.isValid) return 0;

  const wakeDay = DateTime.fromISO(sleepDateStr, { zone });
  if (!wakeDay.isValid) return 0;

  const bedWindowDow = luxonToApiDow(wakeDay.minus({ days: 1 }));
  const win = windowForDow(windows, bedWindowDow);
  const targetStr = win?.start_time || goal?.target_bedtime || '23:00:00';
  const targetMins = parseHhMmSsToMinutes(String(targetStr));
  if (targetMins == null) return 0;

  const bedStart = bed.startOf('day');
  let actualMins = bed.diff(bedStart, 'minutes').minutes;
  let targetOnBedDay = targetMins;
  let dev = actualMins - targetOnBedDay;
  if (dev > 12 * 60) dev -= 24 * 60;
  if (dev < -12 * 60) dev += 24 * 60;
  return Math.round(dev);
}

function buildSuggestions({ avgHours7, goalHours, qualityAvg, consistencyScore }) {
  const out = [];
  if (avgHours7 != null && goalHours != null && avgHours7 + 0.35 < goalHours) {
    out.push(
      `You've averaged about ${avgHours7.toFixed(1)}h vs your ${goalHours.toFixed(1)}h goal — try shifting bedtime 15–20 minutes earlier for a few nights.`
    );
  }
  if (qualityAvg != null && qualityAvg < 3 && avgHours7 != null) {
    out.push(
      `Your recent rest ratings are on the low side — ease up on late caffeine and keep wind-down dim and quiet when you can.`
    );
  }
  if (consistencyScore != null && consistencyScore < 60) {
    out.push(
      `Bedtimes have been shifting — picking a steady "lights out" anchor (even on weekends) often helps energy more than total hours alone.`
    );
  }
  if (out.length === 0) {
    out.push(`Logging a few nights in a row makes patterns obvious — keep brief notes on anything that seemed to help or hurt.`);
  }
  return out.slice(0, 4);
}

export async function buildUserSleepStats(userId, timezone) {
  const zone = timezone && String(timezone).trim() ? String(timezone).trim() : 'UTC';
  const now = DateTime.now().setZone(zone).startOf('day');

  const goal = await getActiveSleepGoal(userId);
  const windows = goal ? await getSleepWindows(goal.sleep_goal_id) : [];

  const fromDate = now.minus({ days: 13 }).toFormat('yyyy-MM-dd');
  const logsRaw = await listUserSleepLogs(userId, { fromDate, limit: 60 });

  const logsByDate = new Map();
  for (const row of logsRaw) {
    logsByDate.set(row.sleep_date, row);
  }

  let streakDays = 0;
  let cursor = now;
  const todayStr = now.toFormat('yyyy-MM-dd');
  if (!logsByDate.has(todayStr)) {
    cursor = now.minus({ days: 1 });
  }
  for (let i = 0; i < 120; i += 1) {
    const d = cursor.minus({ days: i }).toFormat('yyyy-MM-dd');
    if (logsByDate.has(d)) streakDays += 1;
    else break;
  }

  const last7Days = [];
  for (let i = 6; i >= 0; i -= 1) {
    last7Days.push(now.minus({ days: i }).toFormat('yyyy-MM-dd'));
  }

  let durSum = 0;
  let durN = 0;
  let qualSum = 0;
  let qualN = 0;
  const deviations = [];

  for (const d of last7Days) {
    const row = logsByDate.get(d);
    if (row && row.sleep_duration_minutes != null) {
      durSum += Number(row.sleep_duration_minutes);
      durN += 1;
    }
    if (row && row.quality_rating != null) {
      qualSum += Number(row.quality_rating);
      qualN += 1;
    }
    if (row && row.bedtime_wall) {
      deviations.push(bedtimeDeviationMinutes(row.bedtime_wall, d, zone, windows, goal));
    } else {
      deviations.push(0);
    }
  }

  const avgHours7 = durN > 0 ? durSum / durN / 60 : null;
  const qualityAvg = qualN > 0 ? qualSum / qualN : null;
  const qualityScorePct = qualityAvg != null ? Math.round((qualityAvg / 5) * 100) : null;

  const okN = deviations.filter((d) => Math.abs(d) < 20).length;
  const consistencyScore = deviations.length ? Math.round((okN / deviations.length) * 100) : null;

  const goalHours = goalSleepHours(goal, windows);

  const latest = logsRaw[0];
  const lastNightHours =
    latest && latest.sleep_duration_minutes != null
      ? Math.round((Number(latest.sleep_duration_minutes) / 60) * 100) / 100
      : null;

  const logsInRange7 = last7Days.filter((d) => logsByDate.has(d)).length;

  const suggestions = buildSuggestions({
    avgHours7: avgHours7 ?? undefined,
    goalHours,
    qualityAvg: qualityAvg ?? undefined,
    consistencyScore: consistencyScore ?? undefined,
  });

  return {
    zone,
    streak_days: streakDays,
    goal_hours: Math.round(goalHours * 10) / 10,
    avg_hours_last_7: avgHours7 != null ? Math.round(avgHours7 * 100) / 100 : null,
    quality_score_pct: qualityScorePct,
    consistency_score: consistencyScore,
    bedtime_deviation_minutes_last_7: deviations,
    logs_count_last_7: logsInRange7,
    last_night_hours: lastNightHours,
    last_sleep_date: latest?.sleep_date || null,
    suggestions,
  };
}
