import { describe, expect, it } from 'vitest';
import { isPausedByRule, periodKey, scheduleDue, scheduleWindow, type ReminderSchedule } from '../src/schedule';

const schedule: ReminderSchedule = {
  kind: 'weekly',
  weekdays: ['fri'],
  startTime: '14:00',
  stopTime: '18:00',
  repeatEveryMinutes: 30,
  timezone: 'UTC'
};

describe('weekly schedule', () => {
  it('is active only inside the configured window', () => {
    expect(scheduleWindow(schedule, new Date('2026-08-28T13:59:00Z'))).toBe('before');
    expect(scheduleWindow(schedule, new Date('2026-08-28T14:00:00Z'))).toBe('active');
    expect(scheduleWindow(schedule, new Date('2026-08-28T18:01:00Z'))).toBe('after');
    expect(scheduleWindow(schedule, new Date('2026-08-29T15:00:00Z'))).toBe('offday');
  });

  it('respects repeat interval', () => {
    const now = new Date('2026-08-28T15:00:00Z');
    expect(scheduleDue(schedule, now, '2026-08-28T14:29:00Z')).toBe(true);
    expect(scheduleDue(schedule, now, '2026-08-28T14:45:00Z')).toBe(false);
  });

  it('changes period key between weeks', () => {
    expect(periodKey(schedule, new Date('2026-08-28T15:00:00Z'))).not.toBe(periodKey(schedule, new Date('2026-09-04T15:00:00Z')));
  });
});

describe('adaptive reminder types', () => {
  it('runs a one-time reminder only on its selected local date', () => {
    const once: ReminderSchedule = {
      kind: 'once', date: '2026-08-28', weekdays: [], startTime: '14:00', stopTime: '18:00',
      repeatEveryMinutes: 10, timezone: 'UTC'
    };
    expect(scheduleWindow(once, new Date('2026-08-27T15:00:00Z'))).toBe('before');
    expect(scheduleWindow(once, new Date('2026-08-28T15:00:00Z'))).toBe('active');
    expect(scheduleWindow(once, new Date('2026-08-29T15:00:00Z'))).toBe('after');
    expect(periodKey(once, new Date('2026-08-28T15:00:00Z'))).toBe('2026-08-28');
  });

  it('supports an all-day ongoing reminder', () => {
    const ongoing: ReminderSchedule = {
      kind: 'ongoing', weekdays: ['fri'], startTime: '00:00', stopTime: '00:00', allDay: true,
      repeatEveryMinutes: 30, timezone: 'UTC'
    };
    expect(scheduleWindow(ongoing, new Date('2026-08-28T23:59:00Z'))).toBe('active');
    expect(periodKey(ongoing, new Date('2026-08-28T23:59:00Z'))).toBe('ongoing');
  });

  it('supports recurring, exact-date and date-range pauses', () => {
    const now = new Date('2026-08-28T13:30:00Z');
    expect(isPausedByRule([{ type: 'recurring', weekdays: ['fri'], startTime: '13:00', endTime: '14:00' }], now, 'UTC')).toBe(true);
    expect(isPausedByRule([{ type: 'date', date: '2026-08-28', allDay: true }], now, 'UTC')).toBe(true);
    expect(isPausedByRule([{ type: 'date_range', startDate: '2026-08-27', endDate: '2026-08-29', allDay: true }], now, 'UTC')).toBe(true);
  });
});
