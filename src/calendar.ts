import type { Env } from './db';

export interface CalendarWindow {
  isWorkingDay: boolean;
  isWorkingTime: boolean;
  isBusy: boolean;
  activeEventNames: string[];
}

interface GoogleTokenResponse { access_token: string; expires_in: number; token_type: string }
interface GoogleEvent { summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; status?: string }

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(env: Env): Promise<string | null> {
  if (env.GOOGLE_CALENDAR_ACCESS_TOKEN) return env.GOOGLE_CALENDAR_ACCESS_TOKEN;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) throw new Error(`Google OAuth refresh failed: ${response.status}`);
  const token = await response.json<GoogleTokenResponse>();
  tokenCache = { token: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
  return token.access_token;
}

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

function inWorkingHours(now: Date, timeZone: string, start = '09:00', end = '18:00') {
  const p = localParts(now, timeZone);
  const weekday = String(p.weekday).toLowerCase().slice(0, 3);
  const hhmm = `${p.hour}:${p.minute}`;
  const isWorkingDay = !['sat', 'sun'].includes(weekday);
  return { isWorkingDay, isWorkingTime: isWorkingDay && hhmm >= start && hhmm <= end };
}

export async function resolveCalendarWindow(
  env: Env,
  calendarId: string | null | undefined,
  now: Date,
  timeZone: string,
  workingStart = '09:00',
  workingEnd = '18:00'
): Promise<CalendarWindow> {
  const base = inWorkingHours(now, timeZone, workingStart, workingEnd);
  const token = await getAccessToken(env);
  const effectiveCalendarId = calendarId || env.GOOGLE_CALENDAR_ID;
  if (!token || !effectiveCalendarId) {
    return { ...base, isBusy: false, activeEventNames: [] };
  }

  const min = new Date(now.getTime() - 60_000).toISOString();
  const max = new Date(now.getTime() + 60_000).toISOString();
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(effectiveCalendarId)}/events`);
  url.searchParams.set('timeMin', min);
  url.searchParams.set('timeMax', max);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('maxResults', '25');

  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Google Calendar API failed: ${response.status}`);
  const data = await response.json<{ items?: GoogleEvent[] }>();
  const active = (data.items ?? []).filter((event) => event.status !== 'cancelled');
  const names = active.map((event) => event.summary || '(busy)').slice(0, 10);

  return {
    ...base,
    isBusy: active.length > 0,
    activeEventNames: names
  };
}
