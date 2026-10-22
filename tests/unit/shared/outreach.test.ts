import { describe, expect, it } from 'vitest';
import {
  applyOutreachTemplate,
  checkOutreachGuard,
  computeTouchSchedule,
  isQuietHour,
  nextTouchStatus,
  shouldStopEnrollment
} from '../../../packages/shared/src/outreach';

describe('computeTouchSchedule', () => {
  const start = new Date('2026-10-19T09:00:00.000Z');

  it('spaces touches by step delay', () => {
    const schedule = computeTouchSchedule([0, 24, 72], start);
    expect(schedule.map((date) => date.toISOString())).toEqual([
      '2026-10-19T09:00:00.000Z',
      '2026-10-20T09:00:00.000Z',
      '2026-10-22T09:00:00.000Z'
    ]);
  });

  it('rejects negative or non-finite delays', () => {
    expect(() => computeTouchSchedule([0, -1], start)).toThrow();
    expect(() => computeTouchSchedule([0, Number.NaN], start)).toThrow();
  });
});

describe('isQuietHour', () => {
  it('handles quiet hours that cross midnight', () => {
    expect(
      isQuietHour(new Date('2026-10-19T23:00:00'), '22:00', '08:00')
    ).toBe(true);
    expect(
      isQuietHour(new Date('2026-10-19T07:59:00'), '22:00', '08:00')
    ).toBe(true);
    expect(
      isQuietHour(new Date('2026-10-19T12:00:00'), '22:00', '08:00')
    ).toBe(false);
  });

  it('handles same-day quiet hours and invalid input', () => {
    expect(
      isQuietHour(new Date('2026-10-19T12:30:00'), '12:00', '13:00')
    ).toBe(true);
    expect(isQuietHour(new Date('2026-10-19T12:30:00'), 'bad', '13:00')).toBe(
      false
    );
  });
});

describe('checkOutreachGuard', () => {
  const base = {
    channel: 'manual' as const,
    channelStatus: 'verified' as const,
    suppressed: false,
    dailySent: 0,
    weeklySent: 0,
    now: new Date('2026-10-19T10:00:00')
  };

  it('allows a clean manual touch', () => {
    expect(checkOutreachGuard(base)).toEqual({ allowed: true });
  });

  it('blocks suppressed customers', () => {
    expect(
      checkOutreachGuard({ ...base, suppressed: true })
    ).toMatchObject({ allowed: false, code: 'suppressed' });
  });

  it('blocks unverified channels except manual and phone task', () => {
    expect(
      checkOutreachGuard({
        ...base,
        channel: 'email',
        channelStatus: 'unverified',
        email: 'a@b.com'
      })
    ).toMatchObject({ allowed: false, code: 'channel_unverified' });
    expect(
      checkOutreachGuard({
        ...base,
        channel: 'phone_task',
        channelStatus: 'unverified'
      })
    ).toEqual({ allowed: true });
  });

  it('requires an identifier for email', () => {
    expect(
      checkOutreachGuard({
        ...base,
        channel: 'email',
        channelStatus: 'verified',
        email: ''
      })
    ).toMatchObject({ allowed: false, code: 'missing_identifier' });
  });

  it('enforces daily and weekly caps', () => {
    expect(
      checkOutreachGuard({ ...base, dailySent: 1 })
    ).toMatchObject({ allowed: false, code: 'frequency' });
    expect(
      checkOutreachGuard({ ...base, weeklySent: 3 })
    ).toMatchObject({ allowed: false, code: 'frequency' });
  });

  it('blocks quiet hours', () => {
    expect(
      checkOutreachGuard({
        ...base,
        now: new Date('2026-10-19T23:30:00'),
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00'
      })
    ).toMatchObject({ allowed: false, code: 'quiet_hours' });
  });
});

describe('shouldStopEnrollment', () => {
  it('stops on reply, outcome, pause or cancel', () => {
    expect(shouldStopEnrollment({ replied: true })).toBe('replied');
    expect(shouldStopEnrollment({ outcome: 'won' })).toBe('won');
    expect(shouldStopEnrollment({ outcome: 'lost' })).toBe('lost');
    expect(shouldStopEnrollment({ paused: true })).toBe('paused');
    expect(shouldStopEnrollment({ cancelled: true })).toBe('cancelled');
    expect(shouldStopEnrollment({})).toBeNull();
  });
});

describe('applyOutreachTemplate', () => {
  it('replaces known variables and blanks unknown ones', () => {
    expect(
      applyOutreachTemplate(
        '{{name}}，你好。{{company}}的{{intent}}我们可以帮忙。{{missing}}',
        { name: '张总', company: ' Acme ', intent: '私域运营' }
      )
    ).toBe('张总，你好。Acme的私域运营我们可以帮忙。');
  });

  it('does not execute template code', () => {
    expect(
      applyOutreachTemplate('{{name}}', { name: '${process.exit(1)}' })
    ).toBe('${process.exit(1)}');
  });
});

describe('nextTouchStatus', () => {
  const now = new Date('2026-10-19T10:00:00.000Z');

  it('marks due and planned touches', () => {
    expect(nextTouchStatus('2026-10-19T09:00:00.000Z', now)).toBe('due');
    expect(nextTouchStatus('2026-10-19T11:00:00.000Z', now)).toBe('planned');
    expect(nextTouchStatus('not-a-date', now)).toBe('planned');
  });
});
