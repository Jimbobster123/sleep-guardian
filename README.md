# Luna - Sleep Guardian

## App Summary

Luna is a comprehensive sleep optimization and task management application designed to help users protect their sleep schedule while managing their daily workload. The primary users are professionals and students who struggle to balance productivity with adequate rest. Luna intelligently alerts users when calendar events or tasks conflict with their designated sleep windows, provides personalized sleep recommendations, and tracks sleep consistency. By integrating task management with sleep protection, Luna helps users maintain healthy sleep patterns while staying productive, ultimately improving their well-being and daily performance.

## Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with custom design system
- **Build Tool**: Vite
- **State Management**: React Context API
- **UI Components**: Custom shadcn/ui components
- **Testing**: Vitest

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: JavaScript (ES Modules)
- **Database Client**: pg (node-postgres)

### Database
- **Database System**: PostgreSQL
- **Hosting**: Local development instance
- **Query Format**: SQL with parameterized queries for security

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Browser                          │
└────────────────────────────┬──────────────────────────────────────┘
                             │
                   HTTP/REST (Port 8080)
                             │
        ┌────────────────────▼────────────────────┐
        │      Frontend (React + TypeScript)      │
        │  - Tasks Page                           │
        │  - Calendar Page                        │
        │  - Sleep Analytics                      │
        │  - Task Edit Modal                      │
        └────────────────────┬────────────────────┘
                             │
                   HTTP/REST (Port 5001)
                             │
        ┌────────────────────▼────────────────────┐
        │    Backend (Express.js)                 │
        │  - API Routes                           │
        │  - Database Queries                     │
        │  - Business Logic                       │
        │  - CORS Middleware                      │
        └────────────────────┬────────────────────┘
                             │
                   PostgreSQL Connection
                             │
        ┌────────────────────▼────────────────────┐
        │   PostgreSQL Database (luna)            │
        │  - User                                 │
        │  - Task                                 │
        │  - SleepGoal                            │
        │  - SleepWindow                          │
        │  - CalendarEvent                        │
        │  - SleepLog                             │
        │  - And more...                          │
        └─────────────────────────────────────────┘
```

## Prerequisites

Before you begin, ensure you have the following installed on your system:

### Node.js
- **Version**: 16.x or higher
- **Install**: https://nodejs.org/
- **Verify Installation**:
  ```bash
  node --version
  npm --version
  ```

### PostgreSQL
- **Version**: 12 or higher
- **Install**: https://www.postgresql.org/download/
- **Verify Installation**:
  ```bash
  psql --version
  ```
- **Verify psql is in PATH** (should be able to run `psql` from any directory):
  ```bash
  which psql  # macOS/Linux
  where psql  # Windows
  ```

### Git (Optional but Recommended)
- **Install**: https://git-scm.com/
- **Verify Installation**:
  ```bash
  git --version
  ```

## Quick Start (Local)

From the repo root (`sleep-guardian/`):

### 1) Install dependencies
```bash
cd frontend && npm install
cd ../backend && npm install
```

### 2) Ensure PostgreSQL is running
You should be able to connect with `psql`:
```bash
psql --version
psql -U postgres -d postgres -c "SELECT 1;"
```
If you don’t have a `postgres` role locally, replace `-U postgres` with your local Postgres role (often your macOS username).

If that connection fails, start PostgreSQL using whatever you installed:
- macOS (Homebrew): `brew services start postgresql` (or your installed version, e.g. `postgresql@16`)
- Linux (systemd): `sudo systemctl start postgresql`

### 3) Create/load the database (first-time setup)
Create the `luna` database (skip if it already exists):
```bash
psql -U postgres -d postgres -c "CREATE DATABASE luna;"
```
If you get `ERROR:  database "luna" already exists`, that’s fine—continue.

Load schema + migrations:
```bash
psql -U postgres -d luna -f ../db/schema.sql
psql -U postgres -d luna -f ../db/migrations/001_auth_calendar_sleepgoal.sql
```

Optional: load sample data (only run once per database):
```bash
psql -U postgres -d luna -f db/seed.sql
```

If you see errors like `relation ... already exists` or `duplicate key value violates unique constraint`, it usually means you already loaded schema/seed data. You can safely skip that step, or do a reset (see “Resetting the DB” below).

### 4) Configure backend environment
In `backend/.env`, set your Postgres credentials (especially `DB_USER` + `DB_PASSWORD`) and confirm `DB_NAME=luna`.

If you don’t have a local `backend/.env` yet:
```bash
cd backend
cp .env.example .env
```

### 5) Run the app
Terminal 1 (backend):
```bash
cd backend
npm run dev
```
Check: `http://localhost:5001/api/db-health`

Terminal 2 (frontend):
```bash
cd frontend
npm run dev
```
Open: `http://localhost:8080/`

## Installation and Setup (Detailed)

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd sleep-guardian
```

### Step 2: Install Frontend Dependencies
```bash
cd frontend
npm install
```

### Step 3: Install Backend Dependencies
```bash
cd ../backend
npm install
```

### Step 4: Create PostgreSQL Database
Open a terminal and create the `luna` database:

```bash
psql -U postgres
```

Then in the PostgreSQL prompt:
```sql
CREATE DATABASE luna;
\q
```

### Step 5: Load Database Schema
From the root `sleep-guardian` directory, run:

```bash
psql -U postgres -d luna -f db/schema.sql
```

You should see output indicating all tables have been created successfully.

### Step 6: Run Migrations
This repo includes incremental migrations for newer features (auth sessions, sleep-goal modes, calendar import metadata).

```bash
psql -U postgres -d luna -f db/migrations/001_auth_calendar_sleepgoal.sql
```

### Step 7: Seed the Database
Load sample data for testing:

```bash
psql -U postgres -d luna -f db/seed.sql
```

If you run `db/seed.sql` more than once, you will likely see `duplicate key` errors because the seed file inserts fixed UUIDs. If you want a clean slate, reset the database (see “Resetting the DB” below).

> Note: Seed users include placeholder password hashes and are not intended for logging in. Create a new account in the UI for authentication.

### Step 8: Configure Environment Variables

#### Backend Configuration
Navigate to the `backend` folder and create a `.env` file:

```bash
cd backend
```

Copy from the example file:
```bash
cp .env.example .env
```

Edit `.env` and ensure it contains:
```
PORT=5001
FRONTEND_URL=http://localhost:8080
DB_USER=postgres
DB_PASSWORD=DB_PASSWORD
DB_HOST=localhost
DB_PORT=5432
DB_NAME=luna
SESSION_TTL_DAYS=30
```

**Note**: Update `DB_PASSWORD` with your PostgreSQL password.

#### Frontend Configuration (Optional)
By default the frontend calls `http://localhost:5001`. To override, create `frontend/.env`:
```
VITE_API_BASE_URL=http://localhost:5001
```

## Running the Application

### Terminal 1: Start the Backend Server
```bash
cd backend
npm run dev
```

Expected output:
```
✅ Successfully connected to PostgreSQL database
🚀 Server is running on http://localhost:5001
```

### Terminal 2: Start the Frontend Development Server
```bash
cd frontend
npm run dev
```

Expected output:
```
VITE v4.x.x ready in xxx ms

➜  Local:   http://localhost:8080/
```

### Open in Browser
Navigate to `http://localhost:8080/` in your web browser.

## Resetting the DB (Optional)

Use this only if you want to wipe your local `luna` database and re-load schema + seed data.

```bash
psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS luna;"
psql -U postgres -d postgres -c "CREATE DATABASE luna;"
psql -U postgres -d luna -f db/schema.sql
psql -U postgres -d luna -f db/migrations/001_auth_calendar_sleepgoal.sql
psql -U postgres -d luna -f db/seed.sql
```
If your local Postgres role is not `postgres`, replace `-U postgres` with the role you use to connect.

## Features Added
- **Login/Signup**: Create an account and log in (session token stored in localStorage).
- **Sleep Goal Setup**: On first login, you must choose one: set bedtime, set wake time, or set sleep amount, with different times per day.
- **Profile Page**: Update profile + sleep goal settings at `/profile`.
- **Calendar in DB**: Calendar page reads events from the database.
- **Google Calendar Import**: Export Google Calendar as `.ics` and import it on the Profile page.
- **Schedule Suggestions**: Calendar page can suggest shifts (either move events outside a fixed sleep window, or move the sleep window to fit a fixed-duration goal).

## Verifying the Vertical Slice: Task Editing Feature

This section demonstrates the complete task editing workflow, confirming that changes are persisted in the database and survive page refreshes.

### Step 1: Navigate to the Tasks Page
1. Open the application at `http://localhost:8080/`
2. Click on "Tasks" in the navigation menu
3. You should see a list of tasks organized in sections: Priority, Today, and Other

### Step 2: Edit a Task
1. Click the **pencil icon** on any task (e.g., "Complete project report")
2. A modal sheet will slide up from the bottom with the following editable fields:
   - Title
   - Notes
   - Priority (Priority / Today / Other)
   - Due Date (date and time picker)
   - Duration (minutes)
   - Status (Pending / In Progress / Completed)

### Step 3: Make Changes
1. Change the task title (e.g., add " - UPDATED" to the title)
2. Change the priority (select a different option from the dropdown)
3. Change the due date using the date/time picker
4. Click the **"Save"** button

Expected behavior:
- A loading state appears briefly
- The modal closes
- The task list re-renders with the updated information

### Step 4: Verify Database Update
In a new terminal, verify the changes were saved to the database:

```bash
psql -U postgres -d luna
```

Then run this query to see the updated task:
```sql
SELECT task_id, title, priority, due_datetime, status FROM "Task" WHERE title LIKE '%UPDATED%' LIMIT 1;
```

You should see your changes reflected in the database output.

### Step 5: Verify Persistence After Page Refresh
1. Press **F5** or **Cmd+R** to refresh the page
2. Wait for the page to load and data to fetch
3. Navigate back to the Tasks page
4. Verify that your changes are still present:
   - The task title shows your update
   - The task appears in the correct section based on priority and due date
   - The duration, notes, and other fields reflect your changes

**Success Criteria**:
- ✅ Task can be edited via the UI modal
- ✅ Changes are immediately visible in the task list
- ✅ Database contains the updated values
- ✅ Changes persist after page refresh
- ✅ Task is correctly categorized in Priority/Today/Other sections based on new values

### Troubleshooting

**Tasks not appearing?**
- Verify the backend is running and connecting to the database
- Check that `npm run dev` was executed in the backend folder
- Verify the database was seeded with `psql -U postgres -d luna -f db/seed.sql`

**"Failed to fetch" error?**
- Ensure the backend is running on port 5001
- Check browser console (F12) for specific error messages
- Verify CORS is enabled (it should be by default in Express)

**Changes not saving?**
- Check the browser console for network errors
- Verify the backend terminal for any error messages
- Ensure PostgreSQL is running and the `luna` database exists
- Confirm the database credentials in `.env` are correct

**Page doesn't refresh with changes?**
- Close the application and restart both frontend and backend
- Clear browser cache (Ctrl+Shift+Delete or Cmd+Shift+Delete)
- Try in an incognito/private window

## Additional Commands

### Backend
- **Production build**: `npm start`
- **Development with watch**: `npm run dev`

### Frontend
- **Build for production**: `npm run build`
- **Preview production build**: `npm run preview`
- **Run tests**: `npm run test`

### Database
- **Connect to database**: `psql -U postgres -d luna`
- **Backup database**: `pg_dump -U postgres luna > backup.sql`
- **Restore database**: `psql -U postgres -d luna < backup.sql`

## Project Structure

```
sleep-guardian/
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── pages/           # Page components (Tasks, Calendar, etc.)
│   │   ├── components/      # Reusable UI components
│   │   ├── contexts/        # React Context for state management
│   │   └── lib/             # Utilities
│   └── package.json
├── backend/                  # Express backend server
│   ├── index.js            # Main server file
│   ├── db.js               # Database connection
│   ├── queries.js          # Database query functions
│   ├── .env                # Environment variables (local)
│   ├── .env.example        # Environment variables template
│   └── package.json
├── db/                      # Database files
│   ├── schema.sql          # Database schema and table definitions
│   └── seed.sql            # Sample data for testing
└── README.md               # This file
```

## Future Enhancements

- User authentication and authorization
- Sleep analytics and recommendations
- Calendar integration
- Push notifications for sleep reminders
- Mobile app version
- Dark mode theme toggle
- Export sleep data to CSV

## Support

For issues or questions, please refer to the troubleshooting section above or review the application logs in the terminal windows where the frontend and backend are running.

## Current Working functions 
 - Login functionality
 - Adding a sleep goal 
 - Connect to google calander
 - Calander 
 - Add tasks 
 - Ui/ux features
  