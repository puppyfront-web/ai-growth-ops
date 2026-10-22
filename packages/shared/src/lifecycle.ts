/**
 * Canonical lifecycle rules shared by API, Worker and Web.
 *
 * Lead / Customer / Deal each keep their own status field, but every terminal
 * outcome must be interpreted through these functions so the sales pipeline and
 * acquisition funnel cannot disagree.
 */

export const LEAD_STATUSES = [
  'NEW',
  'QUALIFIED',
  'SYNCING',
  'SYNCED',
  'ASSIGNED',
  'CONTACTED',
  'ADDED_WECOM',
  'WON',
  'LOST',
  'INVALID'
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const CUSTOMER_STATUSES = [
  'active',
  'inactive',
  'won',
  'lost'
] as const;

export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const DEAL_STAGE_ORDER = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost'
] as const;

export type DealStage = (typeof DEAL_STAGE_ORDER)[number];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  new: '新建',
  contacted: '已联系',
  qualified: '已确认需求',
  proposal: '方案/报价',
  negotiation: '谈判',
  won: '赢单',
  lost: '输单'
};

export type Outcome = 'won' | 'lost';

const CLOSED_LEAD_STATUSES = new Set<string>(['WON', 'LOST', 'INVALID']);
const CLOSED_CUSTOMER_STATUSES = new Set<string>(['won', 'lost']);
const CLOSED_DEAL_STAGES = new Set<string>(['won', 'lost']);

const DEAL_STAGE_TRANSITIONS: Record<DealStage, ReadonlySet<DealStage>> = {
  new: new Set<DealStage>(['contacted', 'qualified', 'lost']),
  contacted: new Set<DealStage>([
    'qualified',
    'proposal',
    'negotiation',
    'lost'
  ]),
  qualified: new Set<DealStage>(['proposal', 'negotiation', 'won', 'lost']),
  proposal: new Set<DealStage>(['negotiation', 'won', 'lost']),
  negotiation: new Set<DealStage>(['won', 'lost']),
  won: new Set<DealStage>(['negotiation']),
  lost: new Set<DealStage>(['negotiation'])
};

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

export function isCustomerStatus(value: string): value is CustomerStatus {
  return (CUSTOMER_STATUSES as readonly string[]).includes(value);
}

export function isDealStage(value: string): value is DealStage {
  return (DEAL_STAGE_ORDER as readonly string[]).includes(value);
}

export function leadStatusToOutcome(status: string): Outcome | null {
  if (status === 'WON') return 'won';
  if (status === 'LOST') return 'lost';
  return null;
}

export function customerStatusToOutcome(status: string): Outcome | null {
  if (status === 'won') return 'won';
  if (status === 'lost') return 'lost';
  return null;
}

export function dealStageToOutcome(stage: string): Outcome | null {
  if (stage === 'won') return 'won';
  if (stage === 'lost') return 'lost';
  return null;
}

export function isLeadClosed(status: string): boolean {
  return CLOSED_LEAD_STATUSES.has(status);
}

export function isCustomerClosed(status: string): boolean {
  return CLOSED_CUSTOMER_STATUSES.has(status);
}

export function isDealClosed(stage: string): boolean {
  return CLOSED_DEAL_STAGES.has(stage);
}

export function isDealOpen(stage: string): boolean {
  return isDealStage(stage) && !isDealClosed(stage);
}

export class DealStageTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string
  ) {
    super(`商机阶段不能从「${from}」流转到「${to}」`);
    this.name = 'DealStageTransitionError';
  }
}

/**
 * Throws unless `from -> to` is allowed by the deal state machine.
 * Re-applying the same stage is a no-op and always allowed.
 */
export function assertDealStageTransition(from: string, to: string): void {
  if (!isDealStage(from) || !isDealStage(to)) {
    throw new DealStageTransitionError(from, to);
  }
  if (from === to) return;
  if (!DEAL_STAGE_TRANSITIONS[from].has(to)) {
    throw new DealStageTransitionError(from, to);
  }
}

export function canTransitionDealStage(from: string, to: string): boolean {
  try {
    assertDealStageTransition(from, to);
    return true;
  } catch {
    return false;
  }
}

const SLA_HOURS_BY_LEVEL: Record<string, number | null> = {
  A: 4,
  B: 24,
  C: 72,
  D: null
};

/**
 * Default first-touch SLA for a lead level. Returns null for D / unknown levels.
 */
export function defaultNextActionAt(
  level: string | null | undefined,
  now: Date = new Date()
): Date | null {
  const hours = SLA_HOURS_BY_LEVEL[level ?? ''];
  if (hours == null) return null;
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Whole hours overdue. Future, missing or invalid dates return 0.
 */
export function overdueHours(
  value: string | Date | null | undefined,
  now: Date = new Date()
): number {
  if (!value) return 0;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) return 0;
  const diff = now.getTime() - timestamp;
  if (diff <= 0) return 0;
  return Math.floor(diff / (60 * 60 * 1000));
}
