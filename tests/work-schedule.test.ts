import { describe, expect, it } from 'vitest';
import { defaultWorkSchedule, resolveWorkSchedule, type WorkScheduleDefinition } from '../src/work-schedule';

describe('work schedule', () => {
  it('supports split working intervals in one day', () => {
    const s=defaultWorkSchedule('UTC');
    expect(resolveWorkSchedule(s,new Date('2026-08-24T10:30:00Z')).isWorkingTime).toBe(true);
    expect(resolveWorkSchedule(s,new Date('2026-08-24T13:30:00Z')).isWorkingTime).toBe(false);
    expect(resolveWorkSchedule(s,new Date('2026-08-24T15:00:00Z')).isWorkingTime).toBe(true);
  });

  it('treats weekend as non-working by default', () => {
    const s=defaultWorkSchedule('UTC');
    const r=resolveWorkSchedule(s,new Date('2026-08-23T10:00:00Z'));
    expect(r.isWorkingDay).toBe(false);
    expect(r.isWorkingTime).toBe(false);
  });

  it('date exception can turn a normal weekday into a day off', () => {
    const s=defaultWorkSchedule('UTC');
    s.exceptions=[{date:'2026-08-24',working:false}];
    expect(resolveWorkSchedule(s,new Date('2026-08-24T10:00:00Z')).isWorkingTime).toBe(false);
  });

  it('date exception can define a special working day', () => {
    const s:WorkScheduleDefinition={timezone:'UTC',weekly:{sat:[],sun:[]},exceptions:[{date:'2026-08-23',working:true,intervals:[{start:'10:00',end:'12:00'}]}]};
    expect(resolveWorkSchedule(s,new Date('2026-08-23T11:00:00Z')).currentInterval).toEqual({start:'10:00',end:'12:00'});
  });
});
