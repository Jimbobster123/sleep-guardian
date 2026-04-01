import { DateTime } from 'luxon';

/** IANA zone from profile, or browser zone. */
export function effectiveTimeZone(userTz?: string | null): string {
  const t = (userTz || '').trim();
  if (t && DateTime.now().setZone(t).isValid) return t;

  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (browserZone && DateTime.now().setZone(browserZone).isValid) return browserZone;

  return 'UTC';
}

const SQL_FORMAT = "yyyy-MM-dd HH:mm:ss";
const SQL_FORMAT_SHORT = "yyyy-MM-dd HH:mm";

/** Normalize API / Postgres style string to "yyyy-MM-dd HH:mm:ss" for Luxon. */
export function normalizeSqlTs(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim().replace('T', ' ').replace(/Z$/i, '');
  const dot = s.indexOf('.');
  const base = dot >= 0 ? s.slice(0, dot) : s;
  const m = base.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const sec = m[3] ?? '00';
  return `${m[1]} ${m[2]}:${sec}`;
}

/**
 * Interpret DB naive timestamp as wall clock in the user's zone → absolute instant.
 */
export function parseApiTimestamp(value: string | null | undefined, zone: string): DateTime | null {
  const normalized = normalizeSqlTs(value);
  if (!normalized) return null;
  const dt = DateTime.fromFormat(normalized, SQL_FORMAT, { zone });
  if (!dt.isValid) {
    const dt2 = DateTime.fromFormat(normalized.slice(0, 16), SQL_FORMAT_SHORT, { zone });
    return dt2.isValid ? dt2 : null;
  }
  return dt;
}

export function parseApiTimestampToDate(value: string | null | undefined, zone: string): Date | null {
  const dt = parseApiTimestamp(value, zone);
  return dt ? dt.toJSDate() : null;
}

/** Hour of day as float (0–24) in the given zone for an absolute instant. */
export function hourFloatInZone(instant: Date, zone: string): number {
  const dt = DateTime.fromJSDate(instant, { zone: 'utc' }).setZone(zone);
  if (!dt.isValid) return 0;
  return dt.hour + dt.minute / 60 + dt.second / 3600;
}

/**
 * Calendar grid anchors at 3:00 AM: return 0–100% top within the 24h strip for "hour float" in user zone.
 */
export function percentFromHourFloatFrom3am(hourFloat: number): number {
  const from3 = (hourFloat - 3 + 24) % 24;
  return (from3 / 24) * 100;
}

export function snapMinutesToQuarter(totalMinutes: number): number {
  return Math.round(totalMinutes / 15) * 15;
}

/** Format instant as naive SQL timestamp string in user's zone (for API body). */
export function formatTimestampForApi(instant: Date, zone: string): string {
  const dt = DateTime.fromJSDate(instant, { zone: 'utc' }).setZone(zone);
  if (!dt.isValid) return '';
  return dt.toFormat(SQL_FORMAT);
}

/** Build SQL ts from calendar date (yyyy-MM-dd) + HH:mm in user's zone. */
export function combineDateAndTimeForApi(dateYmd: string, timeHm: string, zone: string): string {
  const [yy, mm, dd] = dateYmd.split('-').map(Number);
  const [hh, min] = timeHm.split(':').map(Number);
  const dt = DateTime.fromObject({ year: yy, month: mm, day: dd, hour: hh, minute: min || 0, second: 0 }, { zone });
  if (!dt.isValid) return '';
  return dt.toFormat(SQL_FORMAT);
}

/**
 * Default event end: exactly one hour after start (wall clock in `zone`).
 * Handles day rollover (e.g. 11:00 PM → 12:00 AM next day). Uses 24h HH:mm for time inputs.
 */
export function defaultEndOneHourAfterStart(
  startDateYmd: string,
  startTimeHm: string,
  zone: string,
): { endDate: string; endTime: string } {
  const dateMatch = (startDateYmd || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parts = (startTimeHm || '00:00').split(':').map(Number);
  const hh = parts[0] ?? 0;
  const min = parts[1] ?? 0;
  const timeFallback = `${String(Math.max(0, Math.min(23, hh))).padStart(2, '0')}:${String(Math.max(0, Math.min(59, min))).padStart(2, '0')}`;
  if (!dateMatch) {
    return { endDate: startDateYmd || '', endTime: timeFallback };
  }
  const yy = Number(dateMatch[1]);
  const mm = Number(dateMatch[2]);
  const dd = Number(dateMatch[3]);
  const start = DateTime.fromObject(
    { year: yy, month: mm, day: dd, hour: hh, minute: min, second: 0 },
    { zone },
  );
  if (!start.isValid) {
    return { endDate: startDateYmd, endTime: timeFallback };
  }
  const end = start.plus({ hours: 1 });
  return {
    endDate: end.toFormat('yyyy-MM-dd'),
    endTime: end.toFormat('HH:mm'),
  };
}

/** datetime-local value from DB string, interpreted in zone, shown for browser input (local wall). */
export function toDatetimeLocalInputValue(dbValue: string | null | undefined, zone: string): string {
  const dt = parseApiTimestamp(dbValue, zone);
  if (!dt) return '';
  const local = dt.setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  return local.toFormat("yyyy-MM-dd'T'HH:mm");
}

/** Parse datetime-local input (browser local wall) to SQL ts in user's zone for storage consistency. */
export function fromDatetimeLocalInputToApi(value: string, targetZone: string): string {
  if (!value || !value.includes('T')) return '';
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dt = DateTime.fromISO(value, { zone: browserZone });
  if (!dt.isValid) return '';
  return dt.setZone(targetZone).toFormat(SQL_FORMAT);
}

/**
 * Format Postgres TIME values like "23:00:00" or "23:00" for display (12-hour clock).
 */
export function formatWallTime12h(time: string | null | undefined): string | null {
  if (time == null || String(time).trim() === '') return null;
  const parts = String(time).trim().split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const hour24 = ((Math.floor(h) % 24) + 24) % 24;
  const minute = Math.min(59, Math.max(0, Math.floor(m)));
  const dt = DateTime.fromObject({ year: 2000, month: 1, day: 1, hour: hour24, minute, second: 0 });
  if (!dt.isValid) return null;
  return dt.toFormat('h:mm a');
}

/** Start of wall-clock hour [hour, hour+1) on calendar date (yyyy-MM-dd) in zone. */
export function localHourRowStartOnDate(dateStr: string, wallHour: number, zone: string): DateTime | null {
  const h = Math.min(23, Math.max(0, Math.floor(wallHour)));
  const dt = DateTime.fromISO(`${dateStr}T${String(h).padStart(2, '0')}:00:00`, { zone });
  return dt.isValid ? dt : null;
}

/** Instant of goal bedtime on dateStr from fractional hour (e.g. 23.5 = 11:30 PM that calendar night). */
export function wallBedtimeOnDate(dateStr: string, bedHourFloat: number, zone: string): DateTime | null {
  const day = DateTime.fromISO(dateStr, { zone });
  if (!day.isValid) return null;
  const mins = Math.round(bedHourFloat * 60);
  return day.startOf('day').plus({ minutes: mins });
}

/** Whether [rowStart, rowEnd) overlaps half-open [rangeStart, rangeEnd). */
export function wallIntervalsOverlap(
  rowStart: DateTime,
  rowEnd: DateTime,
  rangeStart: DateTime,
  rangeEnd: DateTime,
): boolean {
  return rowStart < rangeEnd && rowEnd > rangeStart;
}

/**
 * True if the calendar hour row overlaps wind-down [bedtime − flex, bedtime) for saved goal times.
 * `flexMins` must be > 0.
 */
export function hourRowOverlapsWindDown(
  dateStr: string,
  wallHour: number,
  zone: string,
  bedHourFloat: number,
  flexMins: number,
): boolean {
  if (flexMins <= 0) return false;
  const bed = wallBedtimeOnDate(dateStr, bedHourFloat, zone);
  if (!bed || !bed.isValid) return false;
  const wStart = bed.minus({ minutes: flexMins });
  const row0 = localHourRowStartOnDate(dateStr, wallHour, zone);
  if (!row0) return false;
  const row1 = row0.plus({ hours: 1 });
  return wallIntervalsOverlap(row0, row1, wStart, bed);
}

/** Wind-down before a suggested bedtime instant (same semantics as hourRowOverlapsWindDown). */
export function hourRowOverlapsSuggestedWindDown(
  dateStr: string,
  wallHour: number,
  zone: string,
  suggestedBed: DateTime,
  flexMins: number,
): boolean {
  if (flexMins <= 0 || !suggestedBed.isValid) return false;
  const wStart = suggestedBed.minus({ minutes: flexMins });
  const row0 = localHourRowStartOnDate(dateStr, wallHour, zone);
  if (!row0) return false;
  const row1 = row0.plus({ hours: 1 });
  return wallIntervalsOverlap(row0, row1, wStart, suggestedBed);
}

type SleepWindowOverlapOpts = {
  bedHour: number;
  /** End of sleep on the same calendar day when bed is before wake (nap / same-day segment). */
  wakeHour: number;
  bedHourPrev: number;
  wakeHourPrev: number;
  /** True when today’s sleep episode crosses midnight (bedtime hour ≥ wake hour). */
  currentCrossesMidnight: boolean;
  /** True when the morning [midnight, wake) on this date belongs to the previous night’s episode. */
  prevMorningSegment: boolean;
};

/**
 * True if the calendar hour row overlaps actual sleep [bed, wake) on this date — using wall intervals
 * instead of floor(bedHour) so wind-down minutes before bed don’t get painted as sleep.
 */
export function hourRowOverlapsSleepWindow(
  dateStr: string,
  wallHour: number,
  zone: string,
  opts: SleepWindowOverlapOpts,
): boolean {
  const row0 = localHourRowStartOnDate(dateStr, wallHour, zone);
  if (!row0) return false;
  const row1 = row0.plus({ hours: 1 });

  const ranges: Array<[DateTime, DateTime]> = [];

  if (opts.prevMorningSegment) {
    const wakeMorning = wallBedtimeOnDate(dateStr, opts.wakeHourPrev, zone);
    if (wakeMorning?.isValid) {
      const dayStart = DateTime.fromISO(`${dateStr}T00:00:00`, { zone });
      if (wakeMorning > dayStart) {
        ranges.push([dayStart, wakeMorning]);
      }
    }
  }

  if (opts.currentCrossesMidnight) {
    const bedEvening = wallBedtimeOnDate(dateStr, opts.bedHour, zone);
    const dayEnd = DateTime.fromISO(`${dateStr}T00:00:00`, { zone }).plus({ days: 1 });
    if (bedEvening?.isValid && bedEvening < dayEnd) {
      ranges.push([bedEvening, dayEnd]);
    }
  } else {
    const bed = wallBedtimeOnDate(dateStr, opts.bedHour, zone);
    const wake = wallBedtimeOnDate(dateStr, opts.wakeHour, zone);
    if (bed?.isValid && wake?.isValid && wake > bed) {
      ranges.push([bed, wake]);
    }
  }

  return ranges.some(([a, b]) => wallIntervalsOverlap(row0, row1, a, b));
}

/**
 * True if the hour row overlaps [wake, wake + durationHours) — post-wake buffer (e.g. 30 minutes).
 */
export function hourRowOverlapsPostWake(
  dateStr: string,
  wallHour: number,
  zone: string,
  wakeHourFloat: number,
  durationHours = 0.5,
): boolean {
  const wake = wallBedtimeOnDate(dateStr, wakeHourFloat, zone);
  if (!wake?.isValid) return false;
  const end = wake.plus({ minutes: Math.round(durationHours * 60) });
  const row0 = localHourRowStartOnDate(dateStr, wallHour, zone);
  if (!row0) return false;
  const row1 = row0.plus({ hours: 1 });
  return wallIntervalsOverlap(row0, row1, wake, end);
}
