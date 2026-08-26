export interface ReminderSchedule {
  kind?: 'weekly' | 'once' | 'recurring' | 'ongoing';
  weekdays: string[];
  date?: string;
  startTime: string;
  stopTime: string;
  allDay?: boolean;
  repeatEveryMinutes: number;
  timezone: string;
  workingStart?: string;
  workingEnd?: string;
}

export function localClock(timeZone: string, date = new Date()): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function isoWeek(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function periodKey(schedule: ReminderSchedule, now: Date): string {
  const p = localClock(schedule.timezone ?? 'UTC', now);
  const kind = schedule.kind ?? 'weekly';
  if (kind === 'ongoing') return 'ongoing';
  if (kind === 'weekly' || kind === 'recurring') {
    return isoWeek(Number(p.year), Number(p.month), Number(p.day));
  }
  return schedule.date || `${p.year}-${p.month}-${p.day}`;
}

export function scheduleWindow(schedule: ReminderSchedule, now: Date): 'before' | 'active' | 'after' | 'offday' {
  const p = localClock(schedule.timezone ?? 'UTC', now);
  const localDate = `${p.year}-${p.month}-${p.day}`;
  const kind = schedule.kind ?? 'weekly';
  if (kind === 'once' && schedule.date && localDate !== schedule.date) {
    return localDate < schedule.date ? 'before' : 'after';
  }
  const weekday = String(p.weekday).toLowerCase().slice(0, 3);
  if (kind !== 'once' && schedule.weekdays.length && !schedule.weekdays.includes(weekday)) return 'offday';
  if (schedule.allDay) return 'active';
  const hhmm = `${p.hour}:${p.minute}`;
  if (hhmm < schedule.startTime) return 'before';
  if (hhmm > schedule.stopTime) return 'after';
  return 'active';
}

export function scheduleDue(schedule: ReminderSchedule, now: Date, lastExecution?: string | null): boolean {
  if (scheduleWindow(schedule, now) !== 'active') return false;
  if (!lastExecution) return true;
  return now.getTime() - new Date(lastExecution).getTime() >= schedule.repeatEveryMinutes * 60_000;
}

export function isPausedByRule(
  rules: Array<{
    type?: 'recurring' | 'date' | 'date_range';
    weekdays?: string[];
    date?: string;
    startDate?: string;
    endDate?: string;
    allDay?: boolean;
    startTime?: string;
    endTime?: string;
  }>,
  now: Date,
  timezone: string
): boolean {
  const p = localClock(timezone, now);
  const weekday = String(p.weekday).toLowerCase().slice(0, 3);
  const localDate = `${p.year}-${p.month}-${p.day}`;
  const hhmm = `${p.hour}:${p.minute}`;
  return rules.some((rule) => {
    const type = rule.type ?? 'recurring';
    const dateMatches = type === 'date'
      ? rule.date === localDate
      : type === 'date_range'
        ? Boolean(rule.startDate && rule.endDate && localDate >= rule.startDate && localDate <= rule.endDate)
        : !rule.weekdays?.length || rule.weekdays.includes(weekday);
    if (!dateMatches) return false;
    if (rule.allDay) return true;
    return Boolean(rule.startTime && rule.endTime) && hhmm >= String(rule.startTime) && hhmm <= String(rule.endTime);
  });
}
