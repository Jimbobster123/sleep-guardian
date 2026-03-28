import {
  getActiveBedtimeReminders,
  getSleepWindowsForGoals,
  markReminderSent,
} from '../queries.js';

const REMINDER_POLL_MS = Math.max(15_000, Number(process.env.REMINDER_POLL_MS || 60_000));
const MIN_SEND_GAP_MS = 12 * 60 * 60 * 1000;
const TEXT_REMINDERS_AVAILABLE = false;

function getValidTimeZone(timeZone) {
  const candidate = String(timeZone || '').trim();
  if (!candidate) return 'UTC';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return 'UTC';
  }
}

function getZonedNowParts(now, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'long',
  });
  const parts = formatter.formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    weekday: weekdayMap[values.weekday] ?? 0,
  };
}

function parseTimeToMinuteOfDay(value) {
  const match = String(value || '').trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function getBedtimeForDay(reminder, windowsByGoalId, dayOfWeek) {
  const windows = windowsByGoalId.get(reminder.sleep_goal_id) || [];
  const matchedWindow = windows.find((window) => Number(window.day_of_week) === dayOfWeek);
  return matchedWindow?.start_time || reminder.target_bedtime || null;
}

function isRecentSend(lastSentAt, now) {
  if (!lastSentAt) return false;
  const sent = new Date(lastSentAt);
  if (Number.isNaN(sent.getTime())) return false;
  return now.getTime() - sent.getTime() < MIN_SEND_GAP_MS;
}

function buildReminderMessage(reminder, bedtimeText) {
  const greeting = reminder.first_name ? `Hi ${reminder.first_name},` : 'Hi,';
  const minutes = Number(reminder.minutes_before_bedtime || 0);
  const lead = minutes > 0 ? `${minutes} minute${minutes === 1 ? '' : 's'} before` : 'at';
  return {
    subject: 'Sleep Guardian bedtime reminder',
    text: `${greeting} this is your bedtime reminder from Sleep Guardian. Your bedtime is ${bedtimeText}, and this reminder is set for ${lead} bedtime.`,
  };
}

async function sendEmailReminder(reminder, message) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM_EMAIL;
  if (!apiKey || !from) {
    console.warn(`Skipping bedtime email reminder ${reminder.reminder_id}: RESEND_API_KEY or REMINDER_FROM_EMAIL is missing.`);
    return false;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [reminder.email],
      subject: message.subject,
      text: message.text,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend email request failed with status ${res.status}`);
  }
  return true;
}

async function sendTextReminder(reminder, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_PHONE;
  if (!accountSid || !authToken || !from) {
    console.warn(`Skipping bedtime text reminder ${reminder.reminder_id}: Twilio env vars are missing.`);
    return false;
  }

  const body = new URLSearchParams({
    To: reminder.phone_number,
    From: from,
    Body: message.text,
  });

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Twilio SMS request failed with status ${res.status}`);
  }
  return true;
}

async function deliverReminder(reminder, bedtimeText) {
  const message = buildReminderMessage(reminder, bedtimeText);
  if (reminder.method === 'text_message') {
    if (!TEXT_REMINDERS_AVAILABLE) {
      console.warn(`Skipping bedtime text reminder ${reminder.reminder_id}: text reminders are disabled.`);
      return false;
    }
    if (!reminder.phone_number) return false;
    return sendTextReminder(reminder, message);
  }

  if (!reminder.email) return false;
  return sendEmailReminder(reminder, message);
}

function findDueReminderForNow(reminder, windowsByGoalId, now) {
  if (!reminder.enabled) return null;
  if (!reminder.sleep_goal_id) return null;
  if (isRecentSend(reminder.last_sent_at, now)) return null;

  const timeZone = getValidTimeZone(reminder.timezone);
  const localNow = getZonedNowParts(now, timeZone);
  const currentMinuteOfDay = localNow.hour * 60 + localNow.minute;
  const candidateDays = [localNow.weekday, (localNow.weekday + 1) % 7];

  for (const bedtimeDay of candidateDays) {
    const bedtime = getBedtimeForDay(reminder, windowsByGoalId, bedtimeDay);
    const bedtimeMinuteOfDay = parseTimeToMinuteOfDay(bedtime);
    if (bedtimeMinuteOfDay == null) continue;

    const rawReminderMinute = bedtimeMinuteOfDay - Number(reminder.minutes_before_bedtime || 0);
    const reminderMinuteOfDay = ((rawReminderMinute % 1440) + 1440) % 1440;
    const reminderDay = rawReminderMinute >= 0 ? bedtimeDay : (bedtimeDay + 6) % 7;

    if (reminderDay === localNow.weekday && reminderMinuteOfDay === currentMinuteOfDay) {
      return { timeZone, bedtimeText: bedtime.slice(0, 5) };
    }
  }

  return null;
}

async function processBedtimeReminders() {
  const now = new Date();
  const reminders = await getActiveBedtimeReminders();
  const sleepGoalIds = reminders.map((reminder) => reminder.sleep_goal_id).filter(Boolean);
  const windows = await getSleepWindowsForGoals(sleepGoalIds);
  const windowsByGoalId = new Map();

  for (const window of windows) {
    const rows = windowsByGoalId.get(window.sleep_goal_id) || [];
    rows.push(window);
    windowsByGoalId.set(window.sleep_goal_id, rows);
  }

  for (const reminder of reminders) {
    try {
      const due = findDueReminderForNow(reminder, windowsByGoalId, now);
      if (!due) continue;

      const sent = await deliverReminder(reminder, due.bedtimeText);
      if (!sent) continue;

      await markReminderSent(reminder.reminder_id, now);
    } catch (err) {
      console.error(`Bedtime reminder ${reminder.reminder_id} failed:`, err);
    }
  }
}

export function startBedtimeReminderService() {
  if (String(process.env.BEDTIME_REMINDERS_ENABLED || 'true').toLowerCase() === 'false') {
    console.log('Bedtime reminders disabled by BEDTIME_REMINDERS_ENABLED=false');
    return;
  }

  const run = () =>
    processBedtimeReminders().catch((err) => {
      console.error('Bedtime reminder poll failed:', err);
    });

  run();
  setInterval(run, REMINDER_POLL_MS);
}
