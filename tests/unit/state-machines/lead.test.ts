import { describe, it, expect } from 'vitest';

type LeadStatus =
  | 'NEW'
  | 'QUALIFIED'
  | 'SYNCING'
  | 'SYNCED'
  | 'ASSIGNED'
  | 'CONTACTED'
  | 'ADDED_WECOM'
  | 'WON'
  | 'LOST'
  | 'INVALID';

const VALID_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ['QUALIFIED', 'INVALID'],
  QUALIFIED: ['ASSIGNED', 'SYNCING', 'INVALID'],
  SYNCING: ['SYNCED', 'INVALID'],
  SYNCED: ['ASSIGNED', 'CONTACTED', 'INVALID'],
  ASSIGNED: ['CONTACTED', 'SYNCING', 'INVALID'],
  CONTACTED: ['ADDED_WECOM', 'LOST', 'INVALID'],
  ADDED_WECOM: ['WON', 'LOST', 'INVALID'],
  WON: [],
  LOST: [],
  INVALID: []
};

const TERMINAL_STATES: LeadStatus[] = ['WON', 'LOST', 'INVALID'];

function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

function isTerminal(status: LeadStatus): boolean {
  return TERMINAL_STATES.includes(status);
}

describe('Lead State Machine', () => {
  describe('legal transitions', () => {
    it.each([
      ['NEW', 'QUALIFIED'],
      ['NEW', 'INVALID'],
      ['QUALIFIED', 'ASSIGNED'],
      ['QUALIFIED', 'SYNCING'],
      ['SYNCING', 'SYNCED'],
      ['SYNCED', 'ASSIGNED'],
      ['SYNCED', 'CONTACTED'],
      ['ASSIGNED', 'CONTACTED'],
      ['ASSIGNED', 'SYNCING'],
      ['CONTACTED', 'ADDED_WECOM'],
      ['CONTACTED', 'LOST'],
      ['ADDED_WECOM', 'WON'],
      ['ADDED_WECOM', 'LOST']
    ] as [LeadStatus, LeadStatus][])('allows %s → %s', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });
  });

  describe('illegal transitions', () => {
    it.each([
      ['WON', 'CONTACTED'],
      ['WON', 'LOST'],
      ['LOST', 'WON'],
      ['LOST', 'CONTACTED'],
      ['INVALID', 'NEW'],
      ['INVALID', 'QUALIFIED'],
      ['NEW', 'WON'],
      ['NEW', 'CONTACTED']
    ] as [LeadStatus, LeadStatus][])('blocks %s → %s', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });
  });

  describe('terminal states', () => {
    it('WON is terminal', () => {
      expect(isTerminal('WON')).toBe(true);
      expect(VALID_TRANSITIONS['WON']).toHaveLength(0);
    });

    it('LOST is terminal', () => {
      expect(isTerminal('LOST')).toBe(true);
      expect(VALID_TRANSITIONS['LOST']).toHaveLength(0);
    });

    it('INVALID is terminal', () => {
      expect(isTerminal('INVALID')).toBe(true);
      expect(VALID_TRANSITIONS['INVALID']).toHaveLength(0);
    });
  });

  describe('A-level lead assignment', () => {
    it('A-level lead can be assigned', () => {
      expect(canTransition('QUALIFIED', 'ASSIGNED')).toBe(true);
      expect(canTransition('SYNCED', 'ASSIGNED')).toBe(true);
    });
  });

  describe('sync transitions', () => {
    it('QUALIFIED → SYNCING → SYNCED', () => {
      expect(canTransition('QUALIFIED', 'SYNCING')).toBe(true);
      expect(canTransition('SYNCING', 'SYNCED')).toBe(true);
    });

    it('ASSIGNED → SYNCING → SYNCED', () => {
      expect(canTransition('ASSIGNED', 'SYNCING')).toBe(true);
      expect(canTransition('SYNCING', 'SYNCED')).toBe(true);
    });
  });
});
