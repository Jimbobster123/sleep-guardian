import { getActiveSleepGoal, getCalendarEvents, getSleepWindows } from '../queries.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toLocalDateTime(date, timeStr) {
  // date: YYYY-MM-DD (local); timeStr: HH:MM:SS or HH:MM
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss] = String(timeStr || '00:00:00').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0);
}

function toPgTimestampLocal(dt) {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

function addMinutes(dt, minutes) {
  return new Date(dt.getTime() + minutes * 60 * 1000);
}

function minutesBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function normalizeWindow(date, startTime, endTime) {
  const start = toLocalDateTime(date, startTime);
  let end = toLocalDateTime(date, endTime);
  if (end <= start) end = addMinutes(end, 24 * 60);
  return { start, end };
}

function safeEventTimes(e) {
  if (!e.start_datetime || !e.end_datetime) return null;
  const start = new Date(e.start_datetime);
  const end = new Date(e.end_datetime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end <= start) return null;
  return { start, end };
}

function findDurationWindow({ preferredStart, durationMinutes, events }) {
  // search 15-minute increments, roughly evening through late morning
  const searchStart = addMinutes(new Date(preferredStart.getFullYear(), preferredStart.getMonth(), preferredStart.getDate(), 18, 0, 0), 0);
  const searchEnd = addMinutes(searchStart, 18 * 60); // until noon next day

  let best = null;
  for (let t = new Date(searchStart); t <= searchEnd; t = addMinutes(t, 15)) {
    const start = t;
    const end = addMinutes(start, durationMinutes);

    let ok = true;
    for (const ev of events) {
      const times = safeEventTimes(ev);
      if (!times) continue;
      if (overlaps(start, end, times.start, times.end)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const cost = Math.abs(minutesBetween(preferredStart, start));
    if (!best || cost < best.cost) best = { start, end, cost };
  }

  return best;
}

function suggestEventShifts({ sleepStart, sleepEnd, events, preferBeforeSleep }) {
  const conflicts = [];
  const sorted = [...events].sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());

  const occupied = [];
  for (const ev of sorted) {
    const times = safeEventTimes(ev);
    if (!times) continue;
    occupied.push({ start: times.start, end: times.end, event: ev });
  }

  const isFree = (start, end) => {
    for (const o of occupied) {
      if (overlaps(start, end, o.start, o.end)) return false;
    }
    return true;
  };

  for (const ev of sorted) {
    const times = safeEventTimes(ev);
    if (!times) continue;
    if (!overlaps(times.start, times.end, sleepStart, sleepEnd)) continue;

    const duration = minutesBetween(times.start, times.end);
    let suggestedStart = null;
    let suggestedEnd = null;

    if (preferBeforeSleep) {
      // place it ending right before sleepStart, step back by 15 minutes until free
      for (let back = 0; back <= 8 * 60; back += 15) {
        const end = addMinutes(sleepStart, -back);
        const start = addMinutes(end, -duration);
        if (start.getHours() < 6 && start.getDate() === sleepStart.getDate()) continue;
        if (isFree(start, end)) {
          suggestedStart = start;
          suggestedEnd = end;
          break;
        }
      }
    }

    if (!suggestedStart) {
      // place it starting after sleepEnd
      for (let fwd = 0; fwd <= 8 * 60; fwd += 15) {
        const start = addMinutes(sleepEnd, fwd);
        const end = addMinutes(start, duration);
        if (isFree(start, end)) {
          suggestedStart = start;
          suggestedEnd = end;
          break;
        }
      }
    }

    conflicts.push({
      event_id: ev.event_id,
      title: ev.title,
      start_datetime: ev.start_datetime,
      end_datetime: ev.end_datetime,
      reason: 'Overlaps sleep window',
      suggested_start_datetime: suggestedStart ? toPgTimestampLocal(suggestedStart) : null,
      suggested_end_datetime: suggestedEnd ? toPgTimestampLocal(suggestedEnd) : null,
    });
  }

  return conflicts;
}

export async function buildScheduleSuggestions({ userId, date }) {
  const goal = await getActiveSleepGoal(userId);
  const windows = goal ? await getSleepWindows(goal.sleep_goal_id) : [];

  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date (expected YYYY-MM-DD)');
  const dow = d.getDay(); // 0..6

  const window = windows.find((w) => w.day_of_week === dow) || null;
  const defaultStart = window?.start_time || goal?.target_bedtime || '23:00:00';
  const defaultEnd = window?.end_time || goal?.target_wake_time || '07:00:00';

  const preferred = normalizeWindow(date, defaultStart, defaultEnd);

  const from = `${date} 00:00:00`;
  const to = toPgTimestampLocal(addMinutes(new Date(`${date}T00:00:00`), 48 * 60)); // include overnight
  const events = await getCalendarEvents(userId, { from, to });

  const goalType = goal?.goal_type || 'fixed_bed_wake';
  if (goalType === 'fixed_duration') {
    const durationMinutes = Number(goal?.target_sleep_minutes || 0);
    if (!durationMinutes) {
      return {
        date,
        goal_type: goalType,
        error: 'target_sleep_minutes is required for fixed_duration',
      };
    }

    // Preferred start based on preferred end (wake) minus duration
    const preferredStart = addMinutes(preferred.end, -durationMinutes);
    const best = findDurationWindow({ preferredStart, durationMinutes, events });
    if (!best) {
      return {
        date,
        goal_type: goalType,
        sleep_window: { start: toPgTimestampLocal(preferredStart), end: toPgTimestampLocal(preferred.end) },
        conflicts: [],
        warning: 'No conflict-free sleep window found in search range',
      };
    }

    return {
      date,
      goal_type: goalType,
      sleep_window: { start: toPgTimestampLocal(best.start), end: toPgTimestampLocal(best.end) },
      conflicts: [],
    };
  }

  const preferBeforeSleep = goalType === 'fixed_bedtime' || goalType === 'fixed_bed_wake';
  const conflicts = suggestEventShifts({
    sleepStart: preferred.start,
    sleepEnd: preferred.end,
    events,
    preferBeforeSleep,
  });

  return {
    date,
    goal_type: goalType,
    sleep_window: { start: toPgTimestampLocal(preferred.start), end: toPgTimestampLocal(preferred.end) },
    conflicts,
  };
}

