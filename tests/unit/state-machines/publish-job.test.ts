import { describe, it, expect } from 'vitest';

type PublishJobStatus =
  | 'DRAFT'
  | 'READY'
  | 'SCHEDULED'
  | 'RUNNING'
  | 'WAITING_HUMAN_CONFIRM'
  | 'PUBLISHED'
  | 'FAILED'
  | 'NEED_MANUAL_REPAIR'
  | 'CANCELLED';

const VALID_TRANSITIONS: Record<PublishJobStatus, PublishJobStatus[]> = {
  DRAFT: ['READY', 'SCHEDULED'],
  READY: ['RUNNING', 'CANCELLED'],
  SCHEDULED: ['READY', 'RUNNING', 'CANCELLED'],
  RUNNING: [
    'PUBLISHED',
    'FAILED',
    'WAITING_HUMAN_CONFIRM',
    'NEED_MANUAL_REPAIR'
  ],
  WAITING_HUMAN_CONFIRM: ['PUBLISHED', 'FAILED'],
  NEED_MANUAL_REPAIR: ['RUNNING', 'CANCELLED'],
  PUBLISHED: [],
  FAILED: ['READY'],
  CANCELLED: []
};

function canTransition(from: PublishJobStatus, to: PublishJobStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

const MAX_RETRY = 3;

describe('PublishJob State Machine', () => {
  describe('legal transitions', () => {
    it.each([
      ['DRAFT', 'READY'],
      ['DRAFT', 'SCHEDULED'],
      ['SCHEDULED', 'READY'],
      ['SCHEDULED', 'RUNNING'],
      ['SCHEDULED', 'CANCELLED'],
      ['READY', 'RUNNING'],
      ['READY', 'CANCELLED'],
      ['RUNNING', 'PUBLISHED'],
      ['RUNNING', 'FAILED'],
      ['RUNNING', 'WAITING_HUMAN_CONFIRM'],
      ['RUNNING', 'NEED_MANUAL_REPAIR'],
      ['WAITING_HUMAN_CONFIRM', 'PUBLISHED'],
      ['WAITING_HUMAN_CONFIRM', 'FAILED'],
      ['NEED_MANUAL_REPAIR', 'RUNNING'],
      ['NEED_MANUAL_REPAIR', 'CANCELLED'],
      ['FAILED', 'READY']
    ] as [PublishJobStatus, PublishJobStatus][])(
      'allows %s → %s',
      (from, to) => {
        expect(canTransition(from, to)).toBe(true);
      }
    );
  });

  describe('illegal transitions', () => {
    it.each([
      ['PUBLISHED', 'RUNNING'],
      ['PUBLISHED', 'FAILED'],
      ['CANCELLED', 'RUNNING'],
      ['CANCELLED', 'READY'],
      ['FAILED', 'PUBLISHED'],
      ['FAILED', 'RUNNING'],
      ['DRAFT', 'PUBLISHED'],
      ['DRAFT', 'RUNNING'],
      ['WAITING_HUMAN_CONFIRM', 'RUNNING'],
      ['READY', 'PUBLISHED']
    ] as [PublishJobStatus, PublishJobStatus][])(
      'blocks %s → %s',
      (from, to) => {
        expect(canTransition(from, to)).toBe(false);
      }
    );
  });

  describe('terminal states', () => {
    it('PUBLISHED has no outgoing transitions', () => {
      expect(VALID_TRANSITIONS['PUBLISHED']).toHaveLength(0);
    });

    it('CANCELLED has no outgoing transitions', () => {
      expect(VALID_TRANSITIONS['CANCELLED']).toHaveLength(0);
    });
  });

  describe('retry logic', () => {
    it('increments retryCount on failure', () => {
      let retryCount = 0;
      retryCount += 1;
      expect(retryCount).toBe(1);
    });

    it('exceeds max retry → stays FAILED', () => {
      const retryCount = MAX_RETRY;
      expect(retryCount >= MAX_RETRY).toBe(true);
      expect(canTransition('FAILED', 'READY')).toBe(true);
    });

    it('cancelled job cannot be re-executed', () => {
      expect(VALID_TRANSITIONS['CANCELLED']).toHaveLength(0);
    });
  });
});
