/**
 * Inserts / updates a week of sample DailySleepLog rows for a given user email.
 * Run from repo: cd backend && node scripts/seed-daily-sleep-logs-sample.mjs
 *
 * Optional: EMAIL=other@example.com node scripts/seed-daily-sleep-logs-sample.mjs
 */
import 'dotenv/config';
import pool from '../db.js';

const EMAIL = (process.env.EMAIL || 'rachel.m.pinkney@gmail.com').trim().toLowerCase();

function ymdOffsetFromToday(offsetDays) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 7 rows: index 0 = oldest day in window (6 days ago), 6 = today */
const SAMPLES = [
  {
    sleep_goal_hours: 8,
    actual_sleep_hours: 6.75,
    wake_up_count: 3,
    mood: 'tired',
    factors: ['Screen Time', 'Stress'],
    latency_minutes: 45,
  },
  {
    sleep_goal_hours: 8,
    actual_sleep_hours: 7.5,
    wake_up_count: 2,
    mood: 'okay',
    factors: ['Caffeine'],
    latency_minutes: 30,
  },
  {
    sleep_goal_hours: 8,
    actual_sleep_hours: 8.25,
    wake_up_count: 1,
    mood: 'good',
    factors: ['Exercise'],
    latency_minutes: 15,
  },
  {
    sleep_goal_hours: 7.5,
    actual_sleep_hours: 7,
    wake_up_count: 2,
    mood: 'okay',
    factors: ['Heavy Meal', 'Screen Time'],
    latency_minutes: 60,
  },
  {
    sleep_goal_hours: 7.5,
    actual_sleep_hours: 8,
    wake_up_count: 0,
    mood: 'energized',
    factors: [],
    latency_minutes: 15,
  },
  {
    sleep_goal_hours: 8,
    actual_sleep_hours: 5.5,
    wake_up_count: 4,
    mood: 'exhausted',
    factors: ['Stress', 'Alcohol', 'Screen Time'],
    latency_minutes: 60,
  },
  {
    sleep_goal_hours: 8,
    actual_sleep_hours: 7.25,
    wake_up_count: 1,
    mood: 'good',
    factors: ['Exercise', 'Stress'],
    latency_minutes: 30,
  },
];

async function main() {
  const client = await pool.connect();
  try {
    const userRes = await client.query(
      `SELECT user_id, email FROM "User" WHERE LOWER(TRIM(email)) = $1`,
      [EMAIL],
    );
    if (!userRes.rows[0]) {
      console.error(`No user found with email: ${EMAIL}`);
      process.exit(1);
    }
    const { user_id: userId, email } = userRes.rows[0];
    console.log(`Seeding DailySleepLog for ${email} (${userId})`);

    for (let i = 0; i < SAMPLES.length; i++) {
      const offset = SAMPLES.length - 1 - i;
      const logDate = ymdOffsetFromToday(offset);
      const row = SAMPLES[i];
      await client.query(
        `INSERT INTO "DailySleepLog"
          (user_id, log_date, sleep_goal_hours, actual_sleep_hours, wake_up_count, mood, factors, latency_minutes)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7::text[], $8)
         ON CONFLICT (user_id, log_date) DO UPDATE SET
           sleep_goal_hours = EXCLUDED.sleep_goal_hours,
           actual_sleep_hours = EXCLUDED.actual_sleep_hours,
           wake_up_count = EXCLUDED.wake_up_count,
           mood = EXCLUDED.mood,
           factors = EXCLUDED.factors,
           latency_minutes = EXCLUDED.latency_minutes,
           updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          logDate,
          row.sleep_goal_hours,
          row.actual_sleep_hours,
          row.wake_up_count,
          row.mood,
          row.factors,
          row.latency_minutes,
        ],
      );
      console.log(`  ${logDate}: ${row.actual_sleep_hours}h, mood=${row.mood}, wakes=${row.wake_up_count}`);
    }
    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
