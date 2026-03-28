import PageHeader from '@/components/PageHeader';
import ConsistencyScoreCard from '@/components/ConsistencyScoreCard';
import SleepGauge from '@/components/SleepGauge';
import SleepInsightCard from '@/components/SleepInsightCard';
import SleepInsightsCharts from '@/components/SleepInsightsCharts';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiJson } from '@/lib/api';
import { effectiveTimeZone, formatWallTime12h } from '@/lib/calendarTime';
import { estimateSleepGoalHoursForToday } from '@/lib/sleepGoalHours';
import type { SleepCheckinSummary } from '@/lib/sleepCheckinSummary';
import {
  formatDebtHours,
  formatHoursHoursMinutes,
  formatQualityPct,
} from '@/lib/sleepCheckinSummary';
import nightSky from '@/assets/night-sky-header.jpg';
import { DateTime } from 'luxon';
import { Moon, Shield, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type SleepGoalSummary = {
  goal: {
    goal_type?: string;
    target_bedtime: string | null;
    target_wake_time: string | null;
    target_sleep_minutes?: number | null;
    bedtime_flex_minutes?: number | null;
  } | null;
  windows: Array<{ day_of_week: number; start_time: string; end_time: string }>;
};

function apiDayOfWeek(dt: DateTime): number {
  return dt.weekday === 7 ? 0 : dt.weekday;
}

const SleepPage = () => {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const { currentSleepHours, sleepGoal, consistencyScore, crisisMode, bedtime, wakeTime, streak } = useApp();
  const zone = useMemo(() => effectiveTimeZone(user?.timezone), [user?.timezone]);
  const [sleepRes, setSleepRes] = useState<SleepGoalSummary | null>(null);
  const [checkinSummary, setCheckinSummary] = useState<SleepCheckinSummary | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<SleepGoalSummary>('/api/me/sleep-goal', { token });
        if (!cancelled) setSleepRes(data);
      } catch {
        if (!cancelled) setSleepRes(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const fetchCheckinSummary = useCallback(async () => {
    if (!token) {
      setCheckinSummary(null);
      return;
    }
    try {
      const data = await apiJson<SleepCheckinSummary>('/api/me/sleep-checkin-summary', { token });
      setCheckinSummary(data);
    } catch {
      setCheckinSummary(null);
    }
  }, [token]);

  useEffect(() => {
    void fetchCheckinSummary();
  }, [fetchCheckinSummary]);

  useEffect(() => {
    const onSaved = () => void fetchCheckinSummary();
    window.addEventListener('luna-sleep-checkin-saved', onSaved);
    return () => window.removeEventListener('luna-sleep-checkin-saved', onSaved);
  }, [fetchCheckinSummary]);

  const tonightLine = useMemo(() => {
    const now = DateTime.now().setZone(zone);
    const win = sleepRes?.windows?.find((w) => Number(w.day_of_week) === apiDayOfWeek(now));
    const g = sleepRes?.goal;
    if (win) {
      const a = formatWallTime12h(win.start_time);
      const b = formatWallTime12h(win.end_time);
      if (a && b) return `${a} – ${b}`;
    }
    if (g?.target_bedtime || g?.target_wake_time) {
      const a = formatWallTime12h(g.target_bedtime);
      const b = formatWallTime12h(g.target_wake_time);
      if (a && b) return `${a} – ${b}`;
      if (a) return `Target bedtime ${a}`;
      if (b) return `Target wake ${b}`;
    }
    return `${bedtime} – ${wakeTime}`;
  }, [sleepRes, zone, bedtime, wakeTime]);

  const flexMins = sleepRes?.goal?.bedtime_flex_minutes;

  const goalHoursToday = useMemo(
    () => estimateSleepGoalHoursForToday(sleepRes, zone),
    [sleepRes, zone],
  );

  const gaugeHours = checkinSummary?.rolling_7d.avg_time_in_bed_hours ?? currentSleepHours;
  const gaugeGoal = goalHoursToday || sleepGoal;

  const quickQuality =
    checkinSummary?.last_night?.quality_pct ??
    checkinSummary?.rolling_7d.avg_quality_pct ??
    null;
  const quickAvgBed =
    checkinSummary?.last_night?.time_in_bed_hours ??
    checkinSummary?.rolling_7d.avg_time_in_bed_hours ??
    null;
  const quickDebt = checkinSummary?.rolling_7d.sleep_debt_hours ?? null;
  const consistencyFromLogs = checkinSummary?.rolling_7d.consistency_pct ?? consistencyScore;
  const weekVsGoal = useMemo((): (number | null)[] => {
    if (checkinSummary?.rolling_7d?.days?.length === 7) {
      return checkinSummary.rolling_7d.days.map((d) => d.vs_goal_minutes);
    }
    return [null, null, null, null, null, null, null];
  }, [checkinSummary]);

  return (
    <div>
      <PageHeader title="Sleep" compact />

      <div className="space-y-5 px-5 pb-10 pt-1">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-border/30 shadow-md">
          <img src={nightSky} alt="" className="h-44 w-full object-cover md:h-52" />
          <div className="night-gradient absolute inset-0 opacity-80" />
          <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-6">
            <div className="flex items-center gap-2 text-primary-foreground/90">
              <Moon className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-wider">Tonight</span>
            </div>
            <h1 className="mt-1 font-display text-2xl font-semibold text-primary-foreground md:text-3xl">
              {tonightLine}
            </h1>
            <p className="mt-2 max-w-lg text-sm text-primary-foreground/85">
              {flexMins != null
                ? `${flexMins} min wind-down before bed · ${streak}-day streak`
                : `${streak}-day streak · stay gentle with yourself`}
            </p>
          </div>
        </section>

        {/* Quick stats */}
        <section className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-border/50 bg-card px-3 py-3 text-center shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Goal (tonight)</p>
            <p className="mt-1 font-display text-lg font-bold text-foreground">
              {Math.round(gaugeGoal * 10) / 10}h
            </p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card px-3 py-3 text-center shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Quality</p>
            <p className="mt-1 font-display text-lg font-bold text-foreground tabular-nums">
              {formatQualityPct(quickQuality)}
            </p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card px-3 py-3 text-center shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Debt (7d)</p>
            <p className="mt-1 font-display text-lg font-bold text-foreground tabular-nums">
              {formatDebtHours(quickDebt)}
            </p>
          </div>
        </section>
        <p className="text-[11px] text-muted-foreground text-center -mt-2 px-1">
          Time in bed (7d avg):{' '}
          <span className="font-medium text-foreground tabular-nums">
            {formatHoursHoursMinutes(
              checkinSummary?.rolling_7d.avg_time_in_bed_hours ?? quickAvgBed,
            )}
          </span>
          {checkinSummary?.rolling_7d.nights_logged != null ? (
            <span>
              {' '}
              · {checkinSummary.rolling_7d.nights_logged} night
              {checkinSummary.rolling_7d.nights_logged === 1 ? '' : 's'} logged
            </span>
          ) : null}
        </p>

        {token ? <SleepInsightsCharts token={token} zone={zone} /> : null}

        {crisisMode && (
          <section className="rounded-2xl border border-crisis/25 bg-crisis-light p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-crisis">
              <Shield className="h-4 w-4" />
              Crisis recovery
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-foreground">
              <li>Short nap 1–3 PM if you&apos;re crashing (about 20 minutes).</li>
              <li>Prefer 1.5h or 3h sleeps if you can&apos;t get a full night—full cycles help.</li>
              <li>Streak pressure is relaxed; focus on steady wake time when you can.</li>
            </ul>
          </section>
        )}

        {/* Gauge */}
        <section className="relative rounded-2xl border border-border/50 bg-card px-6 py-8 text-center shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rest balance</p>
          <p className="mt-1 text-sm text-muted-foreground">
            7-night average time in bed vs tonight&apos;s goal from your schedule.
          </p>
          <div className="relative mx-auto mt-4 flex justify-center">
            <SleepGauge hours={gaugeHours} goal={gaugeGoal} size={200} />
          </div>
        </section>

        <ConsistencyScoreCard
          score={consistencyFromLogs}
          weekData={weekVsGoal}
          subtitle="Minutes above/below goal (logged nights)"
        />

        <section className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 py-3">
          <Sparkles className="h-4 w-4 shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Quality, debt, and the gauge use your morning check-ins when you log. Tips below are general—use the
            calendar to protect wind-down and sleep blocks.
          </p>
        </section>

        <div className="space-y-3">
          <SleepInsightCard
            title="Why sleep consistency matters"
            description="A steady sleep window helps mood, focus, and memory. Small shifts beat perfection—aim for “close enough” most nights."
            personal
          />
          <SleepInsightCard
            title="Caffeine curfew"
            description="Late caffeine can delay sleep onset even when you don’t feel wired. Consider cutting off after early afternoon on rough weeks."
            actionLabel="Open calendar"
            onAction={() => navigate('/calendar')}
          />
        </div>
      </div>
    </div>
  );
};

export default SleepPage;
