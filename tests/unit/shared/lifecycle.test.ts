import { describe, expect, it } from 'vitest';
import {
  DEAL_STAGE_LABELS,
  DEAL_STAGE_ORDER,
  assertDealStageTransition,
  customerStatusToOutcome,
  dealStageToOutcome,
  defaultNextActionAt,
  isCustomerClosed,
  isDealClosed,
  isLeadClosed,
  leadStatusToOutcome,
  overdueHours
} from '../../../packages/shared/src/lifecycle';

describe('leadStatusToOutcome', () => {
  it('maps closed outcomes only', () => {
    expect(leadStatusToOutcome('WON')).toBe('won');
    expect(leadStatusToOutcome('LOST')).toBe('lost');
    expect(leadStatusToOutcome('NEW')).toBeNull();
    expect(leadStatusToOutcome('CONTACTED')).toBeNull();
    expect(leadStatusToOutcome('INVALID')).toBeNull();
  });
});

describe('customerStatusToOutcome', () => {
  it('maps won and lost only', () => {
    expect(customerStatusToOutcome('won')).toBe('won');
    expect(customerStatusToOutcome('lost')).toBe('lost');
    expect(customerStatusToOutcome('active')).toBeNull();
    expect(customerStatusToOutcome('inactive')).toBeNull();
  });
});

describe('dealStageToOutcome', () => {
  it('maps won and lost only', () => {
    expect(dealStageToOutcome('won')).toBe('won');
    expect(dealStageToOutcome('lost')).toBe('lost');
    expect(dealStageToOutcome('qualified')).toBeNull();
  });
});

describe('closed predicates', () => {
  it('treats won, lost and invalid as closed for leads', () => {
    expect(isLeadClosed('WON')).toBe(true);
    expect(isLeadClosed('LOST')).toBe(true);
    expect(isLeadClosed('INVALID')).toBe(true);
    expect(isLeadClosed('ADDED_WECOM')).toBe(false);
  });

  it('treats won and lost as closed for customers', () => {
    expect(isCustomerClosed('won')).toBe(true);
    expect(isCustomerClosed('lost')).toBe(true);
    expect(isCustomerClosed('active')).toBe(false);
    expect(isCustomerClosed('inactive')).toBe(false);
  });

  it('treats won and lost as closed for deals', () => {
    expect(isDealClosed('won')).toBe(true);
    expect(isDealClosed('lost')).toBe(true);
    expect(isDealClosed('negotiation')).toBe(false);
  });
});

describe('deal stage transitions', () => {
  it('allows forward transitions', () => {
    expect(() => assertDealStageTransition('new', 'contacted')).not.toThrow();
    expect(() => assertDealStageTransition('contacted', 'qualified')).not.toThrow();
    expect(() => assertDealStageTransition('qualified', 'proposal')).not.toThrow();
    expect(() => assertDealStageTransition('proposal', 'negotiation')).not.toThrow();
    expect(() => assertDealStageTransition('negotiation', 'won')).not.toThrow();
  });

  it('allows losing from any open stage', () => {
    expect(() => assertDealStageTransition('new', 'lost')).not.toThrow();
    expect(() => assertDealStageTransition('negotiation', 'lost')).not.toThrow();
  });

  it('allows reopening a closed deal into negotiation', () => {
    expect(() => assertDealStageTransition('won', 'negotiation')).not.toThrow();
    expect(() => assertDealStageTransition('lost', 'negotiation')).not.toThrow();
  });

  it('treats the same stage as a no-op', () => {
    expect(() => assertDealStageTransition('qualified', 'qualified')).not.toThrow();
  });

  it('rejects backward jumps and skipping straight to won', () => {
    expect(() => assertDealStageTransition('negotiation', 'new')).toThrow();
    expect(() => assertDealStageTransition('contacted', 'won')).toThrow();
    expect(() => assertDealStageTransition('won', 'qualified')).toThrow();
  });

  it('rejects unknown stages', () => {
    expect(() =>
      assertDealStageTransition('new', 'unknown' as never)
    ).toThrow();
  });
});

describe('defaultNextActionAt', () => {
  const now = new Date('2026-10-19T00:00:00.000Z');

  it('applies a level-based SLA', () => {
    expect(defaultNextActionAt('A', now)?.toISOString()).toBe(
      '2026-10-19T04:00:00.000Z'
    );
    expect(defaultNextActionAt('B', now)?.toISOString()).toBe(
      '2026-10-20T00:00:00.000Z'
    );
    expect(defaultNextActionAt('C', now)?.toISOString()).toBe(
      '2026-10-22T00:00:00.000Z'
    );
    expect(defaultNextActionAt('D', now)).toBeNull();
  });

  it('returns a fresh date each call', () => {
    const first = defaultNextActionAt('A', now);
    const second = defaultNextActionAt('A', now);
    expect(first).not.toBe(second);
    expect(first?.getTime()).toBe(second?.getTime());
  });
});

describe('overdueHours', () => {
  const now = new Date('2026-10-19T12:00:00.000Z');

  it('returns positive hours for overdue values', () => {
    expect(overdueHours('2026-10-19T06:00:00.000Z', now)).toBe(6);
  });

  it('returns 0 for future or invalid values', () => {
    expect(overdueHours('2026-10-19T18:00:00.000Z', now)).toBe(0);
    expect(overdueHours('not-a-date', now)).toBe(0);
    expect(overdueHours(null, now)).toBe(0);
  });
});

describe('deal stage metadata', () => {
  it('exposes a stable display order', () => {
    expect(DEAL_STAGE_ORDER).toEqual([
      'new',
      'contacted',
      'qualified',
      'proposal',
      'negotiation',
      'won',
      'lost'
    ]);
  });

  it('labels every stage', () => {
    for (const stage of DEAL_STAGE_ORDER) {
      expect(DEAL_STAGE_LABELS[stage]).toBeTruthy();
    }
  });
});
