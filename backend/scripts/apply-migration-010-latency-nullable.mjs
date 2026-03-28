/**
 * Makes DailySleepLog.latency_minutes nullable (migration 010).
 * Uses backend/.env — same DB settings as the API.
 *
 *   cd backend && node scripts/apply-migration-010-latency-nullable.mjs
 */
import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const sqlPath = path.join(__dirname, '..', '..', 'db', 'migrations', '010_daily_sleep_log_latency_nullable.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const pool = new pg.Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

const client = await pool.connect();
try {
  await client.query(sql);
  console.log('Done: migration 010 applied — "DailySleepLog".latency_minutes can be NULL.');
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(msg);
  if (msg.includes('does not exist')) {
    console.error(
      '\nHint: create "DailySleepLog" first — run db/migrations/009_daily_sleep_log.sql (see README Step 3).',
    );
  }
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
