export type SleepCheckinLastNight = {
  log_date: string;
  time_in_bed_hours: number;
  goal_hours: number;
  quality_pct: number;
  vs_goal_hours: number;
};

export type SleepCheckinDaySlot = {
  log_date: string;
  actual_sleep_hours: number | null;
  sleep_goal_hours: number | null;
  quality_pct: number | null;
  vs_goal_minutes: number | null;
};

export type SleepCheckinSummary = {
  timezone: string;
  last_night: SleepCheckinLastNight | null;
  rolling_7d: {
    nights_logged: number;
    avg_time_in_bed_hours: number | null;
    avg_quality_pct: number | null;
    sleep_debt_hours: number;
    consistency_pct: number | null;
    days: SleepCheckinDaySlot[];
  };
  definitions?: {
    quality?: string;
    time_in_bed?: string;
    sleep_debt_7d?: string;
  };
};

/** Format decimal hours as `7h30m` or em dash when missing. */
export function formatHoursHoursMinutes(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return '—';
  const sign = h < 0 ? '−' : '';
  const totalMin = Math.round(Math.abs(h) * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${sign}${hh}h${String(mm).padStart(2, '0')}m`;
}

export function formatQualityPct(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return '—';
  return `${Math.round(p)}%`;
}

export function formatDebtHours(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return '—';
  if (h <= 0) return 'None';
  return `${Math.round(h * 10) / 10}h`;
}
