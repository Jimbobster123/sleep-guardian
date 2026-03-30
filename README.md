# Luna - Sleep Guardian

Luna is a sleep optimization and task management app that helps users protect their sleep schedule while staying productive.

## Tech Stack
- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL

---

## Setup (First Time)

### Prerequisites
- Node.js 18+ — https://nodejs.org/
- PostgreSQL 12+ — https://www.postgresql.org/download/

Verify both are installed:
```bash
node --version
psql --version
```

### 1. Clone the repo
```bash
git clone <repository-url>
cd sleep-guardian
```

### 2. Install dependencies
From the repository root (recommended):
```bash
npm run install-all
```

Or separately:
```bash
cd frontend && npm install
cd ../backend && npm install
```

### 3. Set up the database
```bash
# Create the database
psql -U postgres -d postgres -c "CREATE DATABASE luna;"

# Load schema and migrations (run all files in order)
psql -U postgres -d luna -f db/schema.sql
psql -U postgres -d luna -f db/migrations/001_auth_calendar_sleepgoal.sql
psql -U postgres -d luna -f db/migrations/002_google_calendar_sync.sql
psql -U postgres -d luna -f db/migrations/003_task_planned_datetime.sql
psql -U postgres -d luna -f db/migrations/004_task_category.sql
psql -U postgres -d luna -f db/migrations/005_remove_task_due_calendar_events.sql
psql -U postgres -d luna -f db/migrations/006_recurrence_series.sql
psql -U postgres -d luna -f db/migrations/007_onboarding_okr_timestamps.sql
psql -U postgres -d luna -f db/migrations/008_reminder_delivery_contacts.sql
psql -U postgres -d luna -f db/migrations/009_daily_sleep_log.sql
psql -U postgres -d luna -f db/migrations/010_daily_sleep_log_latency_nullable.sql
psql -U postgres -d luna -f db/migrations/011_user_streak_type.sql

# Optional: load sample data
psql -U postgres -d luna -f db/seed.sql
```

> If you see `database "luna" already exists`, that's fine — just continue.

### 4. Configure the backend
```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and update `DB_PASSWORD` with your PostgreSQL password. If you have no password set locally, leave it blank.

```
PORT=5001
FRONTEND_URL=http://localhost:8080,http://127.0.0.1:8080
DB_USER=postgres
DB_PASSWORD=your_password_here
DB_HOST=localhost
DB_PORT=5432
DB_NAME=luna
SESSION_TTL_DAYS=30
BEDTIME_REMINDERS_ENABLED=true
REMINDER_POLL_MS=60000
REMINDER_FROM_EMAIL=Sleep Guardian <reminders@example.com>
RESEND_API_KEY=your_resend_api_key
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_FROM_PHONE=+15555550123
```

---

## Running the App

You need the API and the Vite dev server running at the same time.

### Option A — One command (from repo root)
```bash
npm run dev:all
```
This runs the backend and frontend together (`concurrently`).

### Option B — Two terminals

**Terminal 1 — Backend (from repo root):**
```bash
npm run dev:backend
```
Or: `cd backend && npm run dev`

Expected output:
```
✅ Successfully connected to PostgreSQL database
Server is running on http://localhost:5001
```

**Terminal 2 — Frontend (from repo root):**
```bash
npm run dev
```
Or: `cd frontend && npm run dev`

Open **http://localhost:8080/** in your browser. If that does not load, try **http://127.0.0.1:8080/**.

### Frontend API URL (local dev)

- By default, **local dev** uses same-origin **`/api`**: Vite proxies requests to `http://127.0.0.1:5001` (see `frontend/vite.config.ts`). You usually do **not** need `VITE_API_BASE_URL` for day-to-day work.
- To call a different API origin, set **`VITE_API_BASE_URL`** (see `frontend/.env.example`). Optional: **`VITE_DEV_API_PROXY`** changes the proxy target for `/api`.
- **Production builds** should set **`VITE_API_BASE_URL`** to your deployed API unless the UI is served from the same host as the API.

Verify the backend: **http://localhost:5001/api/health** or **http://localhost:5001/api/db-health**

---

## Test Account

A test user is available to log in with immediately:

- **Email**: user@gmail.com
- **Password**: password

Or create your own account via the signup page.

---

## Keeping Up to Date

```bash
git fetch origin && git status
```

If you're behind, pull the latest:
```bash
git pull
```

Then re-run `npm install` in both `frontend/` and `backend/` in case dependencies changed.

If the backend fails to start due to a missing column, re-run the migrations in Step 3 — teammates may have added a new migration.

---

## Database: daily sleep check-in (`DailySleepLog`)

Migration **`db/migrations/009_daily_sleep_log.sql`** adds the **`DailySleepLog`** table for the morning “How was your sleep?” check-in and the charts on the **Sleep** tab. The same definition is included in **`db/schema.sql`** so new databases created from the full schema already have this table.

### Table: `"DailySleepLog"`

| Column | Type | Notes |
|--------|------|--------|
| `daily_sleep_log_id` | UUID | Primary key, default `uuid_generate_v4()` |
| `user_id` | UUID | FK to `"User"(user_id)`, cascade delete |
| `log_date` | DATE | Calendar day of the log (user’s intent) |
| `sleep_goal_hours` | DOUBLE PRECISION | Target hours for that night |
| `actual_sleep_hours` | DOUBLE PRECISION | Reported sleep duration |
| `wake_up_count` | INTEGER | How many times they woke up |
| `mood` | VARCHAR(50) | e.g. `exhausted`, `tired`, `okay`, `good`, `energized` |
| `factors` | TEXT[] | Tags such as `Caffeine`, `Alcohol`, `Heavy Meal`, `Screen Time`, `Exercise`, `Stress` |
| `latency_minutes` | INTEGER (nullable) | Time to fall asleep when set (15, 30, 45, or 60); omit if user skips |
| `created_at` / `updated_at` | TIMESTAMPTZ | Audit timestamps |

**Constraint:** `UNIQUE (user_id, log_date)` — at most one row per user per calendar day.

**Index:** `idx_daily_sleep_log_user_date` on `(user_id, log_date DESC)` for range queries.

### User streak mode (`streak_type`)

Migration **`db/migrations/011_user_streak_type.sql`** adds **`User.streak_type`**: `RECORDING` (default) counts consecutive days with a **`DailySleepLog`** row; `GOAL_MET` requires **`actual_sleep_hours >= sleep_goal_hours`** for each day. The home streak badge uses this setting. **`PATCH /api/me/profile`** with `{ "streak_type": "RECORDING" | "GOAL_MET" }` updates it. **`GET /api/me`** returns **`streak_type`** and computed **`streak_days`**.

### API (authenticated, under `/api/me`)

- **`GET /api/me/daily-sleep-log?date=YYYY-MM-DD`** — single day (or null if none).
- **`PUT /api/me/daily-sleep-log`** — create or upsert a row for `date` (JSON body matches the columns above).
- **`GET /api/me/daily-sleep-logs?from=YYYY-MM-DD&to=YYYY-MM-DD`** — list logs in range (for insights charts).
- **`GET /api/me/sleep-checkin-summary`** — rolling 7-day stats from check-ins: estimated **sleep quality** (0–100 from mood, wake-ups, latency), **time in bed** averages, **sleep debt** (sum of goal minus actual for short nights), per-day vs-goal minutes for the consistency chart, plus **definitions** in JSON for the UI.

### Optional: seed fake history for demos

From **`backend/`**, with `backend/.env` pointing at your database:

```bash
cd backend
node scripts/seed-daily-sleep-logs-sample.mjs
```

By default this upserts seven days of sample rows for **`rachel.m.pinkney@gmail.com`**. Use another account with:

```bash
EMAIL=you@example.com node scripts/seed-daily-sleep-logs-sample.mjs
```

---

## Troubleshooting

**Port 5001 already in use:**
```bash
lsof -ti :5001 | xargs kill
```

**Backend shows `Cannot find package '...'`:**
```bash
cd backend && npm install
```

**Frontend says it cannot reach the API:**
- Ensure the backend is running (`npm run dev:backend` or `npm run dev:all`).
- In dev, the UI uses the Vite **`/api` proxy** by default (no CORS friction). If you set **`VITE_API_BASE_URL`** in `frontend/.env`, remove it to use the proxy, or point it at a running API.
- CORS: for LAN testing (e.g. `http://192.168.x.x:8080`) the backend allows private-network origins in non-production; you can also list origins in **`FRONTEND_URL`** in `backend/.env`.

**Signup/login returns 500 or `/api/me` says `Auth error`:**
- Check the backend terminal for the exact Postgres error.
- If you see **`column "phone_number" does not exist`** (or similar) on `"User"`, run **migration 008** from Step 3. The backend also tolerates a missing **`User.phone_number`** column for core auth when migrations have not been applied yet, but you should still run migrations for full profile and reminders.

**Bedtime reminder worker errors in logs:**
- Reminder polling logs failures instead of exiting the process; fix the underlying DB (e.g. missing **`Reminder.method`**) by running migrations **007** and **008** in order.

**Saving the daily sleep log fails or `/api/me/daily-sleep-log` returns 500:**
- Run migration **`009_daily_sleep_log.sql`** (see Step 3). Without **`DailySleepLog`**, the API cannot persist check-ins.
- If saves fail after **`latency_minutes`** was made optional in the app, run **`010_daily_sleep_log_latency_nullable.sql`** (same Step 3 list). Either:
  - **`cd backend && node scripts/apply-migration-010-latency-nullable.mjs`** (uses **`backend/.env`**), or
  - From the repo root: **`psql -U postgres -d luna -f db/migrations/010_daily_sleep_log_latency_nullable.sql`** (adjust **`-U`** / **`-d`** to match **`.env`**).

**Frontend not loading:**
- Make sure both backend and frontend are running
- Check http://localhost:5001/api/health first to confirm the API is up

---

## Home screen (dashboard)

The home page shows, in order:

1. **Sleep** — tonight’s window (from your sleep goal when available), streak, and placeholder “last night” stats; opens the Sleep tab.
2. **Tasks** — priority tasks and tasks due today; opens the full task list.
3. **Calendar** — today’s mini timeline and upcoming events; opens the calendar.

---

## Resetting the Database

Wipes everything and starts fresh:
```bash
psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS luna;"
psql -U postgres -d postgres -c "CREATE DATABASE luna;"
psql -U postgres -d luna -f db/schema.sql
psql -U postgres -d luna -f db/migrations/001_auth_calendar_sleepgoal.sql
psql -U postgres -d luna -f db/migrations/002_google_calendar_sync.sql
psql -U postgres -d luna -f db/migrations/003_task_planned_datetime.sql
psql -U postgres -d luna -f db/migrations/004_task_category.sql
psql -U postgres -d luna -f db/migrations/005_remove_task_due_calendar_events.sql
psql -U postgres -d luna -f db/migrations/006_recurrence_series.sql
psql -U postgres -d luna -f db/migrations/007_onboarding_okr_timestamps.sql
psql -U postgres -d luna -f db/migrations/008_reminder_delivery_contacts.sql
psql -U postgres -d luna -f db/migrations/009_daily_sleep_log.sql
psql -U postgres -d luna -f db/migrations/010_daily_sleep_log_latency_nullable.sql
psql -U postgres -d luna -f db/migrations/011_user_streak_type.sql
psql -U postgres -d luna -f db/seed.sql
```

---

## Project Structure

```
sleep-guardian/
├── frontend/       # React + TypeScript app
├── backend/        # Express API server
│   ├── index.js
│   ├── routes/
│   ├── queries.js
│   └── .env
├── db/
│   ├── schema.sql
│   ├── seed.sql
│   └── migrations/
└── README.md
```

## EARS Requirements




### Complete:


#### Ubiquitous Requirements:
- The system shall allow users to provide event information.
    - User can add tasks
- The system shall store all user-entered event data in a centralized database.
    - Information is being stored in a database
- The system shall restrict access to sleep data to the authenticated account owner only.
    - User is required to log in to see data
#### Event-Driven Requirements:
- When a user enters event information, the system will update the calendar with the event.
- When a user views the calendar, the system shall display event name and time.
- When a user views an event, the system shall display all event information.
- When a user creates an account, the system will store that information.
- When a user enters a correct username and password, they will be able to see their store information.
- When a user presses the "suggest shifts" button, the system shall suggest schedule shifts to accomodate sleep goals.
#### State-Driven Requirements:
- While the time is within the designated sleep time, the system shall inform the user that it is within this time.

### Not Complete:


#### Event-Driven Requirements:
- When a user enters scheduling information, the system will use inputs to calculate personalized sleep suggestions.
- When the suggested sleep time arrives, the system shall send a notification to the user.

#### State-Driven Requirements:
- While the user is interacting with the 'Goal Setting' interface, the system shall display a sidebar containing sleep suggestions.
- While the system is offline, the system shall prevent attempted interactions.


## Features
- Login / Signup with session auth
- Daily sleep check-in modal (home + header “Log”) with data stored in **`DailySleepLog`**
- Sleep tab insights charts (goal vs actual, wakings, mood, latency, factors) from check-in history
- Sleep goal setup (bedtime, wake time, or sleep amount)
- Per-day sleep window configuration
- Calendar with events and tasks listed on it
- Task and event management with priority, due date, and status
- Schedule conflict suggestions
- Profile page
- Events that conflict with bed time show warning
- Schedule-shifting-to-fit-sleep-goals feature
- Bedtime reminders with selectable email or text delivery
