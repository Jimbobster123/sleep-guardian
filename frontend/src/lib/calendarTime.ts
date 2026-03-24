import { DateTime } from 'luxon';

/** IANA zone from profile, or browser zone. */
export function effectiveTimeZone(userTz?: string | null): string {
  const t = (userTz || '').trim();
  if (t) return t;
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
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
