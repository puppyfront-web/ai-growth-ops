import { describe, it, expect } from 'vitest';

type InteractionStatus =
  | 'NEW'
  | 'NORMALIZED'
  | 'CLASSIFYING'
  | 'CLASSIFIED'
  | 'REPLY_SUGGESTED'
  | 'WAITING_HUMAN_REVIEW'
  | 'REPLIED'
  | 'CONVERTED_TO_LEAD'
  | 'IGNORED';

const VALID_TRANSITIONS: Record<InteractionStatus, InteractionStatus[]> = {
  NEW: ['NORMALIZED', 'CLASSIFIED', 'IGNORED'],
  NORMALIZED: ['CLASSIFYING', 'CLASSIFIED'],
  CLASSIFYING: ['CLASSIFIED'],
  CLASSIFIED: ['REPLY_SUGGESTED', 'WAITING_HUMAN_REVIEW', 'IGNORED'],
  REPLY_SUGGESTED: ['REPLIED', 'CONVERTED_TO_LEAD', 'WAITING_HUMAN_REVIEW'],
  WAITING_HUMAN_REVIEW: ['REPLIED', 'IGNORED', 'CONVERTED_TO_LEAD'],
  REPLIED: ['CONVERTED_TO_LEAD'],
  CONVERTED_TO_LEAD: [],
  IGNORED: []
};

function canTransition(
  from: InteractionStatus,
  to: InteractionStatus
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

function canAutoReply(status: InteractionStatus): boolean {
  if (status === 'IGNORED') return false;
  if (status === 'WAITING_HUMAN_REVIEW') return false;
  return status === 'REPLY_SUGGESTED';
}

describe('Interaction State Machine', () => {
  describe('legal transitions', () => {
    it.each([
      ['NEW', 'CLASSIFIED'],
      ['NEW', 'NORMALIZED'],
      ['NEW', 'IGNORED'],
      ['CLASSIFIED', 'REPLY_SUGGESTED'],
      ['CLASSIFIED', 'WAITING_HUMAN_REVIEW'],
      ['CLASSIFIED', 'IGNORED'],
      ['REPLY_SUGGESTED', 'REPLIED'],
      ['REPLY_SUGGESTED', 'CONVERTED_TO_LEAD'],
      ['REPLY_SUGGESTED', 'WAITING_HUMAN_REVIEW'],
      ['WAITING_HUMAN_REVIEW', 'REPLIED'],
      ['WAITING_HUMAN_REVIEW', 'IGNORED'],
      ['REPLIED', 'CONVERTED_TO_LEAD']
    ] as [InteractionStatus, InteractionStatus][])(
      'allows %s → %s',
      (from, to) => {
        expect(canTransition(from, to)).toBe(true);
      }
    );
  });

  describe('illegal transitions', () => {
    it.each([
      ['CONVERTED_TO_LEAD', 'REPLIED'],
      ['IGNORED', 'REPLIED'],
      ['IGNORED', 'CLASSIFIED'],
      ['REPLIED', 'CLASSIFIED'],
      ['CONVERTED_TO_LEAD', 'REPLY_SUGGESTED']
    ] as [InteractionStatus, InteractionStatus][])(
      'blocks %s → %s',
      (from, to) => {
        expect(canTransition(from, to)).toBe(false);
      }
    );
  });

  describe('auto-reply rules', () => {
    it('IGNORED status cannot auto-reply', () => {
      expect(canAutoReply('IGNORED')).toBe(false);
    });

    it('WAITING_HUMAN_REVIEW cannot auto-reply', () => {
      expect(canAutoReply('WAITING_HUMAN_REVIEW')).toBe(false);
    });

    it('REPLY_SUGGESTED can auto-reply', () => {
      expect(canAutoReply('REPLY_SUGGESTED')).toBe(true);
    });

    it('NEW cannot auto-reply (not yet classified)', () => {
      expect(canAutoReply('NEW')).toBe(false);
    });
  });

  describe('convert to lead', () => {
    it('REPLY_SUGGESTED → CONVERTED_TO_LEAD is valid', () => {
      expect(canTransition('REPLY_SUGGESTED', 'CONVERTED_TO_LEAD')).toBe(true);
    });

    it('REPLIED → CONVERTED_TO_LEAD is valid', () => {
      expect(canTransition('REPLIED', 'CONVERTED_TO_LEAD')).toBe(true);
    });

    it('CONVERTED_TO_LEAD is terminal', () => {
      expect(VALID_TRANSITIONS['CONVERTED_TO_LEAD']).toHaveLength(0);
    });

    it('IGNORED is terminal', () => {
      expect(VALID_TRANSITIONS['IGNORED']).toHaveLength(0);
    });
  });
});
