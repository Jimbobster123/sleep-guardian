# Luna - Sleep Guardian

Luna is a sleep optimization and task management app that helps users protect their sleep schedule while staying productive.

## Tech Stack
- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL

---

## Setup (First Time)

### Prerequisites
- Node.js 16+ — https://nodejs.org/
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
```bash
cd frontend && npm install
cd ../backend && npm install
```

### 3. Set up the database
```bash
# Create the database
psql -U postgres -d postgres -c "CREATE DATABASE luna;"

# Load schema and migrations
psql -U postgres -d luna -f db/schema.sql
psql -U postgres -d luna -f db/migrations/001_auth_calendar_sleepgoal.sql

# Add columns required by the latest backend version
psql -U postgres -d luna -c "ALTER TABLE \"User\" ADD COLUMN IF NOT EXISTS google_refresh_token TEXT; ALTER TABLE \"User\" ADD COLUMN IF NOT EXISTS google_calendar_id VARCHAR(255);"

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
```

---

## Running the App

You need two terminals open at the same time, both started **from inside the correct folder**.

**Terminal 1 — Backend (from project root):**
```bash
cd backend
npm run dev
```
Expected output:
```
✅ Successfully connected to PostgreSQL database
🚀 Server is running on http://localhost:5001
```

**Terminal 2 — Frontend (from project root):**
```bash
cd frontend
npm run dev
```

Open **http://localhost:8080/** in your browser. If that does not load, try **http://127.0.0.1:8080/**.

Verify the backend is healthy: **http://localhost:5001/api/db-health**

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

If the backend fails to start due to a missing column, run the alter table command from Step 3 again — teammates may have added new columns.

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

**Signup/login returns 500:**
- Check the backend terminal for the exact error
- If it says `column "..." does not exist`, run the missing column command from Step 3

**Frontend not loading:**
- Make sure both backend and frontend terminals are running
- Check http://localhost:5001/api/db-health first to confirm the backend is up

---

## Resetting the Database

Wipes everything and starts fresh:
```bash
psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS luna;"
psql -U postgres -d postgres -c "CREATE DATABASE luna;"
psql -U postgres -d luna -f db/schema.sql
psql -U postgres -d luna -f db/migrations/001_auth_calendar_sleepgoal.sql
psql -U postgres -d luna -c "ALTER TABLE \"User\" ADD COLUMN IF NOT EXISTS google_refresh_token TEXT; ALTER TABLE \"User\" ADD COLUMN IF NOT EXISTS google_calendar_id VARCHAR(255);"
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


### Not Complete:


#### Event-Driven Requirements:
- When a user enters event information, the system will update the calendar with the event.
- When a user views the calendar, the system shall display event name and time.
- When a user views an event, the system shall display all event information.
- When a user enters scheduling information, the system will use inputs to calculate personalized sleep suggestions.
- When the suggested sleep time arrives, the system shall send a notification to the user.
- When a user creates an account, the system will store that information.
- When a user enters a correct username and password, they will be able to see their store information.
#### State-Driven Requirements:
- While the time is within the designated sleep time, the system shall inform the user that it is within this time.
- While the user is interacting with the 'Goal Setting' interface, the system shall display a sidebar containing sleep suggestions.
- While the system is offline, the system shall prevent attempted interactions.


## Features
- Login / Signup with session auth
- Sleep goal setup (bedtime, wake time, or sleep amount)
- Per-day sleep window configuration
- Calendar with Google Calendar ICS import
- Task management with priority, due date, and status
- Schedule conflict suggestions
- Profile page
