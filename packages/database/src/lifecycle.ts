import { Prisma } from '@prisma/client';
import type { DealStage as PrismaDealStage } from '@prisma/client';
import type { DatabaseClient } from './client.js';
import { recordConversionEvents } from './experiments.js';

type Tx = Prisma.TransactionClient;
type Outcome = 'won' | 'lost';

type SyncOptions = {
  lostReason?: string | null;
  reopenReason?: string | null;
  operator?: string | null;
};

async function lockCustomer(tx: Tx, organizationId: string, customerId: string) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${`lifecycle:${organizationId}:${customerId}`})
    )
  `;
}

function outcomeTitle(displayName: string, outcome: Outcome): string {
  return `${displayName} · ${outcome === 'won' ? '成交' : '流失'}`;
}

/**
 * Creates the outcome deal for a customer when none exists. Caller must hold
 * the customer advisory lock and run inside a transaction.
 */
export async function ensureDealForOutcome(
  tx: Tx,
  params: {
    organizationId: string;
    userId: string;
    customer: {
      id: string;
      displayName: string;
      channel: string;
    };
    outcome: Outcome;
    leadId?: string | null;
    lostReason?: string | null;
    source?: string;
    /** Align an existing closed deal with the outcome instead of leaving it stale. */
    forceOutcome?: boolean;
  }
): Promise<{ created: boolean; dealId: string | null }> {
  const existing = await tx.deal.findFirst({
    where: {
      customerId: params.customer.id,
      organizationId: params.organizationId,
      deletedAt: null
    },
    select: { id: true, stage: true }
  });
  if (existing) {
    if (params.forceOutcome && existing.stage !== params.outcome) {
      await tx.deal.update({
        where: { id: existing.id },
        data: {
          stage: params.outcome,
          wonAt: params.outcome === 'won' ? new Date() : null,
          closedAt: new Date(),
          lostReason:
            params.outcome === 'lost'
              ? params.lostReason?.trim() || '未填写流失原因'
              : null
        }
      });
      await tx.dealActivity.create({
        data: {
          dealId: existing.id,
          action: params.outcome,
          note:
            params.outcome === 'won'
              ? '结局同步：成交'
              : `结局同步：流失${params.lostReason ? `（${params.lostReason}）` : ''}`,
          operator: 'system'
        }
      });
    }
    return { created: false, dealId: existing.id };
  }

  const now = new Date();
  const deal = await tx.deal.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId,
      customerId: params.customer.id,
      leadId: params.leadId ?? null,
      title: outcomeTitle(params.customer.displayName, params.outcome),
      stage: params.outcome,
      sourceChannel: params.customer.channel as never,
      lostReason:
        params.outcome === 'lost'
          ? params.lostReason?.trim() || '未填写流失原因'
          : null,
      wonAt: params.outcome === 'won' ? now : null,
      closedAt: now,
      metadata: {
        lifecycleSource: params.source ?? 'outcome_sync'
      } as never
    }
  });
  await tx.dealActivity.create({
    data: {
      dealId: deal.id,
      action: params.outcome,
      note:
        params.outcome === 'won'
          ? '结局同步：成交'
          : `结局同步：流失${params.lostReason ? `（${params.lostReason}）` : ''}`,
      operator: 'system'
    }
  });
  return { created: true, dealId: deal.id };
}

async function closeOpenDeals(
  tx: Tx,
  organizationId: string,
  customerId: string,
  outcome: Outcome,
  options: SyncOptions
) {
  const now = new Date();
  const openDeals = await tx.deal.findMany({
    where: {
      organizationId,
      customerId,
      deletedAt: null,
      stage: { notIn: ['won', 'lost'] }
    },
    select: { id: true }
  });
  if (openDeals.length === 0) return 0;
  await tx.deal.updateMany({
    where: { id: { in: openDeals.map((deal) => deal.id) } },
    data: {
      stage: outcome,
      wonAt: outcome === 'won' ? now : null,
      closedAt: now,
      lostReason:
        outcome === 'lost'
          ? options.lostReason?.trim() || '未填写流失原因'
          : null
    }
  });
  return openDeals.length;
}

export async function syncLeadOutcomeTx(
  tx: Tx,
  leadId: string,
  organizationId: string,
  outcome: Outcome,
  options: SyncOptions = {}
) {
  const lead = await tx.lead.findFirst({
    where: { id: leadId, organizationId, deletedAt: null },
    include: { customer: true }
  });
  if (!lead) throw new Error('线索不存在');

  await tx.lead.update({
    where: { id: lead.id },
    data: { status: outcome === 'won' ? 'WON' : 'LOST' }
  });

  if (!lead.customer) {
    return { leadId: lead.id, customerId: null, dealId: null };
  }

  await lockCustomer(tx, organizationId, lead.customer.id);
  await tx.customer.update({
    where: { id: lead.customer.id },
    data: { status: outcome }
  });

  const closed = await closeOpenDeals(
    tx,
    organizationId,
    lead.customer.id,
    outcome,
    options
  );
  let dealId: string | null = null;
  if (closed === 0) {
    if (outcome === 'won' || options.lostReason) {
      const ensured = await ensureDealForOutcome(tx, {
        organizationId,
        userId: lead.userId,
        customer: {
          id: lead.customer.id,
          displayName: lead.customer.displayName,
          channel: lead.customer.channel
        },
        outcome,
        leadId: lead.id,
        lostReason: options.lostReason,
        source: 'lead_outcome',
        forceOutcome: true
      });
      dealId = ensured.dealId;
    }
  }

  return { leadId: lead.id, customerId: lead.customer.id, dealId };
}

export async function syncLeadOutcome(
  db: DatabaseClient,
  leadId: string,
  organizationId: string,
  outcome: Outcome,
  options: SyncOptions = {}
) {
  return db.$transaction((tx) =>
    syncLeadOutcomeTx(tx, leadId, organizationId, outcome, options)
  );
}

export async function syncCustomerOutcomeTx(
  tx: Tx,
  customerId: string,
  organizationId: string,
  outcome: Outcome,
  options: SyncOptions = {}
) {
  const customer = await tx.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null }
  });
  if (!customer) throw new Error('客户不存在');

  await lockCustomer(tx, organizationId, customer.id);
  await tx.customer.update({
    where: { id: customer.id },
    data: { status: outcome }
  });

  await tx.lead.updateMany({
    where: {
      organizationId,
      customerId: customer.id,
      deletedAt: null,
      status: { notIn: ['WON', 'LOST', 'INVALID'] }
    },
    data: { status: outcome === 'won' ? 'WON' : 'LOST' }
  });

  const closed = await closeOpenDeals(
    tx,
    organizationId,
    customer.id,
    outcome,
    options
  );
  let dealId: string | null = null;
  if (closed === 0 && outcome === 'won') {
    const ensured = await ensureDealForOutcome(tx, {
      organizationId,
      userId: customer.userId,
      customer: {
        id: customer.id,
        displayName: customer.displayName,
        channel: customer.channel
      },
      outcome,
      lostReason: options.lostReason,
      source: 'customer_outcome',
      forceOutcome: true
    });
    dealId = ensured.dealId;
  }

  return { customerId: customer.id, dealId };
}

export async function syncCustomerOutcome(
  db: DatabaseClient,
  customerId: string,
  organizationId: string,
  outcome: Outcome,
  options: SyncOptions = {}
) {
  return db.$transaction((tx) =>
    syncCustomerOutcomeTx(tx, customerId, organizationId, outcome, options)
  );
}

export async function syncDealOutcomeTx(
  tx: Tx,
  dealId: string,
  organizationId: string,
  stage: PrismaDealStage,
  options: SyncOptions = {}
) {
  const deal = await tx.deal.findFirst({
    where: { id: dealId, organizationId, deletedAt: null },
    include: { customer: true }
  });
  if (!deal) throw new Error('商机不存在');

  const previousStage = deal.stage;
  const nextOutcome =
    stage === 'won' || stage === 'lost' ? (stage as Outcome) : null;
  const wasClosed = previousStage === 'won' || previousStage === 'lost';
  const isReopen = wasClosed && nextOutcome === null;
  const now = new Date();

  const updated = await tx.deal.update({
    where: { id: deal.id },
    data: {
      stage,
      ...(nextOutcome === 'won'
        ? { wonAt: deal.wonAt ?? now, closedAt: deal.closedAt ?? now }
        : {}),
      ...(nextOutcome === 'lost'
        ? {
            wonAt: null,
            closedAt: deal.closedAt ?? now,
            lostReason: options.lostReason?.trim() || deal.lostReason || '未填写流失原因'
          }
        : {}),
      ...(isReopen
        ? { wonAt: null, closedAt: null, lostReason: null }
        : {})
    }
  });

  if (previousStage !== stage) {
    await tx.dealActivity.create({
      data: {
        dealId: deal.id,
        action: isReopen ? 'reopened' : `stage_changed`,
        note: isReopen
          ? `商机重开：${options.reopenReason?.trim() || '未填写原因'}`
          : `阶段 ${previousStage} → ${stage}`,
        operator: options.operator ?? 'system'
      }
    });
  }

  if (nextOutcome) {
    await tx.customer.update({
      where: { id: deal.customerId },
      data: { status: nextOutcome }
    });
    if (deal.leadId) {
      await tx.lead.updateMany({
        where: { id: deal.leadId, organizationId },
        data: { status: nextOutcome === 'won' ? 'WON' : 'LOST' }
      });
    }
    if (nextOutcome === 'won') {
      // Experiment conversion: count this deal as a `won` event for the
      // customer's variant. Deduped by deal id so re-winning doesn't double count.
      await recordConversionEvents(tx, organizationId, {
        metric: 'won',
        entityType: 'customer',
        entityId: deal.customerId,
        dedupeKey: `deal:${deal.id}`
      });
    }
  } else if (isReopen) {
    await tx.customer.update({
      where: { id: deal.customerId },
      data: { status: 'active' }
    });
    if (deal.leadId) {
      await tx.lead.updateMany({
        where: {
          id: deal.leadId,
          organizationId,
          status: { in: ['WON', 'LOST'] }
        },
        data: { status: 'QUALIFIED' }
      });
    }
  }

  return { deal: updated, previousStage };
}

export async function syncDealOutcome(
  db: DatabaseClient,
  dealId: string,
  organizationId: string,
  stage: PrismaDealStage,
  options: SyncOptions = {}
) {
  return db.$transaction((tx) =>
    syncDealOutcomeTx(tx, dealId, organizationId, stage, options)
  );
}
