import dotenv from 'dotenv';
import { google } from 'googleapis';
import { updateUserGoogleIntegration, upsertImportedCalendarEvent, updateCalendarEvent } from '../queries.js';

dotenv.config();

// Use full calendar scope so we can read + create/update/delete events.
const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar'];

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth env vars missing (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function createGoogleAuthUrl(state) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: CALENDAR_SCOPES,
    state,
  });
}

export async function handleGoogleOAuthCallback(code, userId) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('No refresh_token returned from Google. Ensure access_type=offline and prompt=consent.');
  }
  client.setCredentials(tokens);

  const calendar = google.calendar({ version: 'v3', auth: client });
  const me = await calendar.calendarList.get({ calendarId: 'primary' });
  const calendarId = me.data.id || 'primary';

  const user = await updateUserGoogleIntegration(userId, {
    google_refresh_token: tokens.refresh_token,
    google_calendar_id: calendarId,
  });
  return user;
}

function getAuthedCalendarClient(user) {
  if (!user.google_refresh_token) {
    throw new Error('User has no Google refresh token');
  }
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: user.google_refresh_token });
  const calendar = google.calendar({ version: 'v3', auth: client });
  const calendarId = user.google_calendar_id || 'primary';
  return { calendar, calendarId };
}

export async function syncGoogleToLocal({ user, timeMin, timeMax }) {
  const { calendar, calendarId } = getAuthedCalendarClient(user);

  const res = await calendar.events.list({
    calendarId,
    singleEvents: true,
    orderBy: 'startTime',
    timeMin,
    timeMax,
  });

  const events = res.data.items || [];
  let imported = 0;
  for (const ev of events) {
    if (!ev.id || !ev.start) continue;

    const start = ev.start.dateTime || ev.start.date;
    const end = ev.end?.dateTime || ev.end?.date || start;
    const isAllDay = Boolean(ev.start.date && !ev.start.dateTime);

    await upsertImportedCalendarEvent(user.user_id, {
      external_uid: ev.id,
      title: ev.summary || 'Google event',
      description: ev.description || null,
      start_datetime: start ? new Date(start) : null,
      end_datetime: end ? new Date(end) : null,
      is_all_day: isAllDay,
      source: 'google',
    });
    imported += 1;
  }
  return { imported };
}

export async function pushLocalEventToGoogle({ user, event }) {
  if (!user.google_refresh_token) return;
  const { calendar, calendarId } = getAuthedCalendarClient(user);

  const body = {
    summary: event.title || 'Event',
    description: event.description || undefined,
    start: {
      dateTime: event.start_datetime,
      timeZone: user.timezone || 'UTC',
    },
    end: {
      dateTime: event.end_datetime,
      timeZone: user.timezone || 'UTC',
    },
  };

  let googleEventId = event.google_event_id || null;
  if (googleEventId) {
    await calendar.events.update({
      calendarId,
      eventId: googleEventId,
      requestBody: body,
    });
  } else {
    const created = await calendar.events.insert({
      calendarId,
      requestBody: body,
    });
    googleEventId = created.data.id || null;
  }

  if (googleEventId && event.event_id) {
    await updateCalendarEvent(user.user_id, event.event_id, { google_event_id: googleEventId, source: 'google' });
  }
}

export async function deleteGoogleEventForLocal({ user, event }) {
  if (!user.google_refresh_token) return;
  if (!event.google_event_id) return;
  const { calendar, calendarId } = getAuthedCalendarClient(user);
  try {
    await calendar.events.delete({
      calendarId,
      eventId: event.google_event_id,
    });
  } catch (err) {
    // swallow 404s etc.
  }
}

