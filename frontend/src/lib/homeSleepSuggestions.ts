import { DateTime } from 'luxon';
import type { SleepCheckinSummary } from '@/lib/sleepCheckinSummary';

type Opts = {
  priorityOpenCount?: number;
  goalHoursTonight?: number | null;
};

type Metrics = {
  q: number | null;
  bed: number | null;
  goal: number | null;
  debt: number;
  nights: number;
  hasLast: boolean;
  vsGoal: number | null;
  napLabel: string;
};

function buildMetrics(summary: SleepCheckinSummary | null, zone: string, opts: Opts): Metrics {
  const last = summary?.last_night;
  const r = summary?.rolling_7d;
  const q = last?.quality_pct ?? r?.avg_quality_pct ?? null;
  const bed = last?.time_in_bed_hours ?? r?.avg_time_in_bed_hours ?? null;
  const goalLast = last?.goal_hours ?? null;
  const goal = goalLast ?? opts.goalHoursTonight ?? null;
  const debt = r?.sleep_debt_hours ?? 0;
  const nights = r?.nights_logged ?? 0;
  const hasLast = Boolean(last);
  let vsGoal: number | null = null;
  if (goal != null && bed != null && Number.isFinite(goal) && Number.isFinite(bed)) {
    vsGoal = bed - goal;
  }

  const now = DateTime.now().setZone(zone);
  let nap = now.set({ hour: 13, minute: 30, second: 0, millisecond: 0 });
  if (now > nap.plus({ hours: 2 })) {
    nap = now.set({ hour: 15, minute: 0, second: 0, millisecond: 0 });
  }
  const napLabel = nap.toFormat('h:mm a');

  return { q, bed, goal, debt, nights, hasLast, vsGoal, napLabel };
}

function shortOnSleep(m: Metrics): boolean {
  return (
    m.goal != null &&
    m.bed != null &&
    Number.isFinite(m.goal) &&
    Number.isFinite(m.bed) &&
    m.bed < m.goal - 0.5
  );
}

function wellAboveGoal(m: Metrics): boolean {
  return m.vsGoal != null && m.vsGoal >= 0.75;
}

function atOrAboveGoal(m: Metrics): boolean {
  return m.vsGoal != null && m.vsGoal >= -0.25;
}

/**
 * Short coaching bullets from check-in stats (not medical advice).
 */
export function buildHomeSleepSuggestions(
  summary: SleepCheckinSummary | null,
  zone: string,
  opts: Opts = {},
): string[] {
  const m = buildMetrics(summary, zone, opts);
  const out: string[] = [];
  const roughQ = m.q != null && m.q < 50;
  const okQ = m.q != null && m.q >= 72;
  const greatQ = m.q != null && m.q >= 82;

  if (m.nights === 0 && !m.hasLast) {
    out.push('Log your morning check-in so we can tailor today’s nudges to how you actually slept.');
    out.push('Even a quick log helps with time in bed, quality, and weekly debt.');
    return out.slice(0, 3);
  }

  if (m.hasLast && wellAboveGoal(m) && greatQ) {
    out.push(
      'You got plenty of sleep and your quality looks strong—great fuel for a focused day.',
    );
    out.push('Consider tackling a priority task or a workout while energy is on your side.');
  } else if (m.hasLast && atOrAboveGoal(m) && okQ) {
    out.push('Solid night by your numbers—you’re close to or on your sleep goal with decent quality.');
    out.push('Keep momentum: pick 2–3 meaningful tasks and protect a calm wind-down tonight.');
  } else if (m.hasLast && atOrAboveGoal(m) && roughQ) {
    out.push('Time in bed looks fine, but quality came in low—you might still feel foggy or wired.');
    out.push('Go lighter on intensity today; add a short walk or daylight break before deep work.');
  } else if (m.hasLast && shortOnSleep(m) && roughQ) {
    out.push(
      `Quality and time in bed both look low—your body may need recovery before big pushes.`,
    );
    out.push(`A ~30 minute nap around ${m.napLabel} can help; plan an earlier bedtime tonight.`);
  } else if (m.hasLast && shortOnSleep(m) && !roughQ) {
    out.push('You were under your goal hours, but quality held up—you may be slightly underslept, not wrecked.');
    out.push('Move one non-urgent task to tomorrow if you can, and avoid late caffeine.');
  } else if (m.debt >= 4) {
    out.push(`Sleep debt is high (~${Math.round(m.debt * 10) / 10}h over the week)—recovery beats grinding today.`);
    out.push('Trim optional commitments and aim for your full window tonight.');
  } else if (m.debt >= 2) {
    out.push(`You’re carrying some debt (~${Math.round(m.debt * 10) / 10}h)—prioritize rest as much as deadlines allow.`);
    out.push('Short naps or an earlier bedtime both count toward paying it down.');
  } else if (!m.hasLast && m.nights > 0 && okQ && atOrAboveGoal(m)) {
    out.push('Your 7-night average looks healthy—keep logging mornings so today’s tips stay personal.');
  } else if (!m.hasLast && m.nights > 0 && shortOnSleep(m)) {
    out.push('Rolling average suggests shorter nights lately—today is a good day to defend sleep time.');
    out.push(`Consider blocking recovery time on the calendar (e.g. nap near ${m.napLabel}).`);
  } else {
    out.push('Keep logging—more nights of data make these tips sharper.');
    out.push('Tonight, aim for your usual window and a steady wind-down.');
  }

  const pri = opts.priorityOpenCount ?? 0;
  if (pri >= 3 && shortOnSleep(m) && (m.q == null || m.q < 65)) {
    out.push('You have several priority tasks open—defer or delegate one if you’re running on empty.');
  }

  return out.slice(0, 3);
}

export type DailyActionChoice = 'accepted' | 'declined';

export type DailyAction = {
  scenarioId: string;
  headline: string;
  detail?: string;
  acceptLabel?: string;
  /** Accept opens the sleep check-in modal instead of routing. */
  acceptOpenSleepLog?: boolean;
  acceptNavigate?: '/tasks' | '/calendar' | '/sleep';
};

const STORAGE_PREFIX = 'luna_home_daily_action_';

export function readDailyActionChoice(dateStr: string): DailyActionChoice | null {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + dateStr);
    if (v === 'accepted' || v === 'declined') return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeDailyActionChoice(dateStr: string, choice: DailyActionChoice): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + dateStr, choice);
  } catch {
    /* ignore */
  }
}

/**
 * One primary “try this today” line with optional navigation on Accept.
 */
export function buildDailyAction(
  summary: SleepCheckinSummary | null,
  zone: string,
  opts: Opts = {},
): DailyAction {
  const m = buildMetrics(summary, zone, opts);
  const roughQ = m.q != null && m.q < 50;
  const okQ = m.q != null && m.q >= 72;
  const greatQ = m.q != null && m.q >= 82;

  if (m.nights === 0 && !m.hasLast) {
    return {
      scenarioId: 'log_morning',
      headline: 'Start with a quick morning sleep log so today’s plan matches how you woke up.',
      detail: 'Takes under a minute and unlocks better tips tomorrow too.',
      acceptLabel: 'Open log',
      acceptOpenSleepLog: true,
    };
  }

  if (m.hasLast && wellAboveGoal(m) && greatQ) {
    return {
      scenarioId: 'energized_tasks',
      headline:
        'You banked strong rest—channel it into real progress. Pick your top tasks and knock out a focused block this morning.',
      acceptLabel: 'Plan tasks',
      acceptNavigate: '/tasks',
    };
  }

  if (m.hasLast && atOrAboveGoal(m) && okQ) {
    return {
      scenarioId: 'steady_day',
      headline:
        'Nice recovery last night. Use today to stay steady: line up priorities, then protect your wind-down tonight.',
      acceptLabel: 'Review tasks',
      acceptNavigate: '/tasks',
    };
  }

  if (m.hasLast && atOrAboveGoal(m) && roughQ) {
    return {
      scenarioId: 'body_ok_brain_tired',
      headline:
        'Hours looked okay but quality was low—treat today as a “steady, not heroic” day. Light movement and one hard task max before lunch.',
      acceptLabel: 'See calendar',
      acceptNavigate: '/calendar',
    };
  }

  if (m.hasLast && shortOnSleep(m) && roughQ) {
    return {
      scenarioId: 'recover',
      headline: `Recovery first: schedule a ~30 min nap or quiet break around ${m.napLabel}, and move one task you don’t truly need today.`,
      acceptLabel: 'Open calendar',
      acceptNavigate: '/calendar',
    };
  }

  if (m.hasLast && shortOnSleep(m)) {
    return {
      scenarioId: 'mild_short',
      headline:
        'You were a bit short on sleep. Defer one smaller task to tomorrow and aim for an earlier bedtime tonight.',
      acceptLabel: 'Review tasks',
      acceptNavigate: '/tasks',
    };
  }

  if (m.debt >= 3) {
    return {
      scenarioId: 'debt_high',
      headline:
        'Sleep debt is stacking—today, defend rest like it’s a deadline. Block recovery time and skip optional extras.',
      acceptLabel: 'Sleep tools',
      acceptNavigate: '/sleep',
    };
  }

  if (!m.hasLast && m.nights > 0 && shortOnSleep(m)) {
    return {
      scenarioId: 'rolling_short',
      headline:
        'Your recent average looks short on sleep—plan a gentler day and block time for an earlier night.',
      acceptLabel: 'Open calendar',
      acceptNavigate: '/calendar',
    };
  }

  return {
    scenarioId: 'default_habit',
    headline:
      'Keep building the habit: log again tomorrow and hold tonight’s sleep window as best you can.',
    acceptLabel: 'Sleep insights',
    acceptNavigate: '/sleep',
  };
}
