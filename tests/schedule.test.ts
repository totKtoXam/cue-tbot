import { describe, expect, it } from 'vitest';
import { periodKey, scheduleDue, scheduleWindow, type ReminderSchedule } from '../src/schedule';

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
