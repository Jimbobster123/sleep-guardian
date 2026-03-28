import { useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { apiJson } from '@/lib/api';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { cn } from '@/lib/utils';

type ApiLog = {
  log_date: string;
  sleep_goal_hours: number;
  actual_sleep_hours: number;
  wake_up_count: number;
  mood: string;
  factors: string[] | null;
  latency_minutes: number | null;
};

const MOOD_SCORE: Record<string, number> = {
  exhausted: 1,
  tired: 2,
  okay: 3,
  good: 4,
  energized: 5,
};

const MOOD_LABELS: Record<number, string> = {
  1: 'Exhausted',
  2: 'Tired',
  3: 'Okay',
  4: 'Good',
  5: 'Energized',
};

const FACTOR_ORDER = [
  'Caffeine',
  'Alcohol',
  'Heavy Meal',
  'Screen Time',
  'Exercise',
  'Stress',
] as const;

function parseFactors(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  return [];
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function shortLabel(ymd: string, zone: string): string {
  const dt = DateTime.fromFormat(ymd, 'yyyy-MM-dd', { zone });
  if (!dt.isValid) return ymd.slice(5);
  return dt.toFormat('MMM d');
}

type RangeDays = 7 | 30 | 90;

type SleepInsightsChartsProps = {
  token: string;
  zone: string;
  className?: string;
};

const SleepInsightsCharts = ({ token, zone, className }: SleepInsightsChartsProps) => {
  const [range, setRange] = useState<RangeDays>(30);
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { fromStr, toStr } = useMemo(() => {
    const to = DateTime.now().setZone(zone);
    const from = to.minus({ days: range - 1 });
    return {
      fromStr: from.toFormat('yyyy-MM-dd'),
      toStr: to.toFormat('yyyy-MM-dd'),
    };
  }, [zone, range]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({ from: fromStr, to: toStr });
        const res = await apiJson<{ logs: ApiLog[] }>(`/api/me/daily-sleep-logs?${q}`, { token });
        if (!cancelled) setLogs(Array.isArray(res.logs) ? res.logs : []);
      } catch (e) {
        if (!cancelled) {
          setLogs([]);
          setError(e instanceof Error ? e.message : 'Could not load sleep logs');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, fromStr, toStr]);

  const timeline = useMemo(
    () =>
      logs.map((row) => {
        const ymd =
          typeof row.log_date === 'string'
            ? row.log_date.slice(0, 10)
            : String(row.log_date).slice(0, 10);
        const moodKey = String(row.mood || '').toLowerCase();
        const moodScore = MOOD_SCORE[moodKey] ?? null;
        return {
          date: ymd,
          label: shortLabel(ymd, zone),
          goal: Math.round(num(row.sleep_goal_hours) * 10) / 10,
          actual: Math.round(num(row.actual_sleep_hours) * 10) / 10,
          wake: Math.floor(num(row.wake_up_count)),
          moodScore,
          moodLabel: moodScore != null ? MOOD_LABELS[moodScore] ?? row.mood : row.mood,
          latency:
            row.latency_minutes != null && Number.isFinite(num(row.latency_minutes))
              ? Math.floor(num(row.latency_minutes))
              : null,
        };
      }),
    [logs, zone],
  );

  const factorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of FACTOR_ORDER) counts[f] = 0;
    for (const row of logs) {
      for (const f of parseFactors(row.factors)) {
        if (f in counts) counts[f] += 1;
      }
    }
    return FACTOR_ORDER.map((name) => ({ name, count: counts[name] })).filter((x) => x.count > 0);
  }, [logs]);

  const hasFactorData = factorCounts.length > 0;

  const rangeBtn = (d: RangeDays, label: string) => (
    <button
      key={d}
      type="button"
      onClick={() => setRange(d)}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
        range === d ? 'bg-accent text-accent-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  );

  const cardClass = 'rounded-2xl border border-border/50 bg-card p-4 shadow-sm';

  const chartBox = 'mx-auto w-full min-h-[220px]';

  if (loading) {
    return (
      <section className={cn('space-y-3', className)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-foreground">Sleep check-in insights</h2>
          <div className="flex gap-1">{rangeBtn(7, '7d')}{rangeBtn(30, '30d')}{rangeBtn(90, '90d')}</div>
        </div>
        <p className="text-sm text-muted-foreground">Loading your logs…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={cn('space-y-3', className)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-foreground">Sleep check-in insights</h2>
          <div className="flex gap-1">{rangeBtn(7, '7d')}{rangeBtn(30, '30d')}{rangeBtn(90, '90d')}</div>
        </div>
        <p className="text-sm text-destructive">{error}</p>
      </section>
    );
  }

  if (timeline.length === 0) {
    return (
      <section className={cn('space-y-3', className)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-foreground">Sleep check-in insights</h2>
          <div className="flex gap-1">{rangeBtn(7, '7d')}{rangeBtn(30, '30d')}{rangeBtn(90, '90d')}</div>
        </div>
        <div className={cn(cardClass, 'text-sm text-muted-foreground')}>
          No check-ins in this range yet. Complete the daily sleep log from the home page or the Log button in the
          header to see charts here.
        </div>
      </section>
    );
  }

  const goalActualConfig = {
    goal: { label: 'Goal (h)', color: 'hsl(var(--sleep))' },
    actual: { label: 'Actual (h)', color: 'hsl(var(--accent))' },
  };

  const wakeConfig = { wake: { label: 'Wake-ups', color: 'hsl(var(--warning))' } };
  const moodConfig = { mood: { label: 'Mood (1–5)', color: 'hsl(var(--consistency))' } };
  const latencyConfig = { latency: { label: 'Minutes', color: 'hsl(var(--wake))' } };
  const factorConfig = { count: { label: 'Nights', color: 'hsl(var(--accent))' } };

  return (
    <section className={cn('space-y-5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Sleep check-in insights</h2>
          <p className="text-xs text-muted-foreground">From your daily sleep log ({fromStr} – {toStr})</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {rangeBtn(7, '7 days')}
          {rangeBtn(30, '30 days')}
          {rangeBtn(90, '90 days')}
        </div>
      </div>

      <div className={cardClass}>
        <p className="text-sm font-medium text-foreground">Goal vs actual sleep</p>
        <p className="text-xs text-muted-foreground mb-2">Hours per night</p>
        <ChartContainer config={goalActualConfig} className={cn(chartBox, 'aspect-[16/9] max-h-[280px]')}>
          <LineChart data={timeline} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis width={36} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} domain={[0, 'auto']} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="monotone" dataKey="goal" stroke="var(--color-goal)" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="actual" stroke="var(--color-actual)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ChartContainer>
      </div>

      <div className={cardClass}>
        <p className="text-sm font-medium text-foreground">Night wakings</p>
        <p className="text-xs text-muted-foreground mb-2">Times you woke up (per check-in day)</p>
        <ChartContainer config={wakeConfig} className={cn(chartBox, 'aspect-[16/9] max-h-[260px]')}>
          <BarChart data={timeline} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis width={28} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="wake" fill="var(--color-wake)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </div>

      <div className={cardClass}>
        <p className="text-sm font-medium text-foreground">Morning mood</p>
        <p className="text-xs text-muted-foreground mb-2">1 = exhausted, 5 = energized</p>
        <ChartContainer config={moodConfig} className={cn(chartBox, 'aspect-[16/9] max-h-[260px]')}>
          <LineChart data={timeline} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis
              width={28}
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as (typeof timeline)[number];
                if (row.moodScore == null) return null;
                return (
                  <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-md">
                    <p className="font-medium text-foreground">{row.label}</p>
                    <p className="text-muted-foreground">{row.moodLabel}</p>
                    <p className="font-mono tabular-nums text-foreground">{row.moodScore}/5</p>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="moodScore"
              stroke="var(--color-mood)"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ChartContainer>
      </div>

      <div className={cardClass}>
        <p className="text-sm font-medium text-foreground">Time to fall asleep</p>
        <p className="text-xs text-muted-foreground mb-2">
          Minutes when you chose an answer; nights left blank are skipped
        </p>
        <ChartContainer config={latencyConfig} className={cn(chartBox, 'aspect-[16/9] max-h-[260px]')}>
          <BarChart data={timeline} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis width={32} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="latency" fill="var(--color-latency)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </div>

      <div className={cardClass}>
        <p className="text-sm font-medium text-foreground">Factors tagged</p>
        <p className="text-xs text-muted-foreground mb-2">How many nights you selected each factor</p>
        {hasFactorData ? (
          <ChartContainer config={factorConfig} className={cn(chartBox, 'min-h-[200px] aspect-[4/3] max-h-[320px]')}>
            <BarChart data={factorCounts} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={88}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="text-sm text-muted-foreground py-6 text-center">No factors tagged in this range.</p>
        )}
      </div>
    </section>
  );
};

export default SleepInsightsCharts;
