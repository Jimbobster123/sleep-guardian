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

function findBestSleepWindow({
  preferredStart,
  durationMinutes,
  events,
  windDownMinutes = 15,
  searchBeforeMinutes = 12 * 60,
  searchAfterMinutes = 12 * 60,
}) {
  // Search 15-minute increments around the preferred start, keeping the same sleep duration.
  const sortedPreferredStart = new Date(preferredStart);
  if (Number.isNaN(sortedPreferredStart.getTime())) return null;

  const occupied = [];
  for (const ev of events) {
    const times = safeEventTimes(ev);
    if (!times) continue;
    occupied.push({ start: times.start, end: times.end, event: ev });
  }

  const isFree = (start, end) => {
    for (const o of occupied) {
      // Wind-down is blocked too: it is the interval before bedtime.
      // That matches the backend conflict validation.
      const blockedStart = windDownMinutes ? addMinutes(start, -windDownMinutes) : start;
      if (overlaps(blockedStart, end, o.start, o.end)) return false;
    }
    return true;
  };

  const stepMinutes = 15;
  const from = addMinutes(sortedPreferredStart, -searchBeforeMinutes);
  const to = addMinutes(sortedPreferredStart, searchAfterMinutes);

  let best = null;
  for (let t = new Date(from); t <= to; t = addMinutes(t, stepMinutes)) {
    const start = t;
    const end = addMinutes(start, durationMinutes);
    if (!isFree(start, end)) continue;
    const cost = Math.abs(minutesBetween(sortedPreferredStart, start));
    if (!best || cost < best.cost) best = { start, end, cost };
  }

  return best;
}

export async function buildScheduleSuggestions({ userId, date, proposedEvent = null }) {
  const goal = await getActiveSleepGoal(userId);
  const windows = goal ? await getSleepWindows(goal.sleep_goal_id) : [];

  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date (expected YYYY-MM-DD)');
  const dowA = d.getDay(); // 0..6
  const dPrev = new Date(d);
  dPrev.setDate(dPrev.getDate() - 1);
  const dowPrev = dPrev.getDay(); // 0..6
  const prevDateStr = `${dPrev.getFullYear()}-${pad(dPrev.getMonth() + 1)}-${pad(dPrev.getDate())}`;

  const windowA = windows.find((w) => w.day_of_week === dowA) || null;
  const defaultStartA = windowA?.start_time || goal?.target_bedtime || '23:00:00';
  const defaultEndA = windowA?.end_time || goal?.target_wake_time || '07:00:00';

  // When the sleep window crosses midnight (typical bedtime > wake time), early-morning
  // hours on date `YYYY-MM-DD` belong to the previous "bedtime episode".
  const windowPrev = windows.find((w) => w.day_of_week === dowPrev) || null;
  const defaultStartPrev = windowPrev?.start_time || goal?.target_bedtime || '23:00:00';
  const defaultEndPrev = windowPrev?.end_time || goal?.target_wake_time || '07:00:00';

  const preferredA = normalizeWindow(date, defaultStartA, defaultEndA);
  const preferredPrev = normalizeWindow(prevDateStr, defaultStartPrev, defaultEndPrev);

  let preferred = preferredA;
  let preferredAnchorDateStr = date;
  if (proposedEvent?.start_datetime && proposedEvent?.end_datetime) {
    const proposedTimes = safeEventTimes({ start_datetime: proposedEvent.start_datetime, end_datetime: proposedEvent.end_datetime });
    if (proposedTimes && (overlaps(proposedTimes.start, proposedTimes.end, preferredPrev.start, preferredPrev.end) || overlaps(proposedTimes.start, proposedTimes.end, preferredA.start, preferredA.end))) {
      // Pick whichever episode overlaps the proposed event (so we shift the correct "bedtime episode").
      if (overlaps(proposedTimes.start, proposedTimes.end, preferredPrev.start, preferredPrev.end)) {
        preferred = preferredPrev;
        preferredAnchorDateStr = prevDateStr;
      } else {
        preferred = preferredA;
        preferredAnchorDateStr = date;
      }
    }
  }

  const preferredSleepWindow = { start: toPgTimestampLocal(preferred.start), end: toPgTimestampLocal(preferred.end) };

  // Expand the search range so candidate shifted sleep windows (which may start on the previous day)
  // still get collision checks against existing events.
  const from = `${prevDateStr} 00:00:00`;
  const to = toPgTimestampLocal(addMinutes(new Date(`${date}T00:00:00`), 72 * 60)); // 3 days
  const events = await getCalendarEvents(userId, { from, to });
  if (proposedEvent?.start_datetime && proposedEvent?.end_datetime) {
    events.push({
      event_id: 'proposed',
      title: 'proposed',
      start_datetime: proposedEvent.start_datetime,
      end_datetime: proposedEvent.end_datetime,
    });
  }

  const goalType = goal?.goal_type || 'fixed_bed_wake';
  const durationMinutes =
    goalType === 'fixed_duration' ? Number(goal?.target_sleep_minutes || 0) : minutesBetween(preferred.start, preferred.end);

  if (!durationMinutes || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return {
      date,
      goal_type: goalType,
      preferred_sleep_window: preferredSleepWindow,
      sleep_window: preferredSleepWindow,
      conflicts: [],
      moved_sleep_window: false,
      warning: 'Could not determine a valid sleep duration; using preferred window.',
    };
  }

  // If fixed_duration, prefer the window that keeps the preferred end (wake) time.
  const preferredStart = goalType === 'fixed_duration' ? addMinutes(preferred.end, -durationMinutes) : preferred.start;
  const windDownMinutes = Math.max(15, Number(goal?.bedtime_flex_minutes || 60));
  const best = findBestSleepWindow({ preferredStart, durationMinutes, events, windDownMinutes });

  if (!best) {
    // Fallback: keep the preferred sleep window and (optionally) suggest shifting events.
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
      preferred_sleep_window: preferredSleepWindow,
      sleep_window: preferredSleepWindow,
      conflicts,
      moved_sleep_window: false,
      warning: 'No conflict-free sleep window found; keeping preferred sleep window.',
    };
  }

  const sleepWindow = { start: toPgTimestampLocal(best.start), end: toPgTimestampLocal(best.end) };
  const movedSleepWindow =
    sleepWindow.start !== preferredSleepWindow.start || sleepWindow.end !== preferredSleepWindow.end;

  return {
    date,
    goal_type: goalType,
    preferred_sleep_window: preferredSleepWindow,
    sleep_window: sleepWindow,
    conflicts: [],
    moved_sleep_window: movedSleepWindow,
    anchor_date: preferredAnchorDateStr,
  };
}

