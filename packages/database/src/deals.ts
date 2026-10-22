import { Prisma } from '@prisma/client';
import {
  assertDealStageTransition,
  DealStageTransitionError,
  defaultNextActionAt,
  isDealClosed,
  isDealStage,
  overdueHours,
  type DealStage
} from '@ai-growth-ops/shared';
import type { DatabaseClient } from './client.js';
import { syncDealOutcomeTx } from './lifecycle.js';

export class DealNotFoundError extends Error {
  constructor() {
    super('商机不存在');
    this.name = 'DealNotFoundError';
  }
}

export class DealValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DealValidationError';
  }
}

type DealListInput = {
  organizationId: string;
  stage?: string | null;
  customerId?: string | null;
  ownerId?: string | null;
  q?: string | null;
  page?: number;
  pageSize?: number;
};

export type DealListItem = Prisma.DealGetPayload<{
  include: {
    customer: {
      select: {
        id: true;
        displayName: true;
        phone: true;
        status: true;
        channel: true;
      };
    };
    lead: {
      select: {
        id: true;
        status: true;
        level: true;
        externalUserName: true;
      };
    };
  };
}>;

const DEAL_INCLUDE = {
  customer: {
    select: {
      id: true,
      displayName: true,
      phone: true,
      status: true,
      channel: true
    }
  },
  lead: {
    select: {
      id: true,
      status: true,
      level: true,
      externalUserName: true
    }
  }
} as const;

function normalizePage(page: number | undefined, pageSize: number | undefined) {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page!)) : 1;
  const safeSize = Number.isFinite(pageSize)
    ? Math.min(100, Math.max(1, Math.floor(pageSize!)))
    : 20;
  return { page: safePage, pageSize: safeSize };
}

export async function listDeals(
  db: DatabaseClient,
  input: DealListInput
): Promise<{ items: DealListItem[]; total: number; page: number; pageSize: number }> {
  const { page, pageSize } = normalizePage(input.page, input.pageSize);
  const where: Prisma.DealWhereInput = {
    organizationId: input.organizationId,
    deletedAt: null
  };
  if (input.stage) {
    if (!isDealStage(input.stage)) throw new DealValidationError('商机阶段不合法');
    where.stage = input.stage;
  }
  if (input.customerId) where.customerId = input.customerId;
  if (input.ownerId) where.ownerId = input.ownerId;
  const q = input.q?.trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { customer: { displayName: { contains: q, mode: 'insensitive' } } }
    ];
  }

  const [items, total] = await Promise.all([
    db.deal.findMany({
      where,
      include: DEAL_INCLUDE,
      orderBy: [{ nextActionAt: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    db.deal.count({ where })
  ]);

  return { items, total, page, pageSize };
}

export async function getDeal(
  db: DatabaseClient,
  dealId: string,
  organizationId: string
) {
  const deal = await db.deal.findFirst({
    where: { id: dealId, organizationId, deletedAt: null },
    include: {
      ...DEAL_INCLUDE,
      activities: { orderBy: { createdAt: 'desc' } }
    }
  });
  if (!deal) throw new DealNotFoundError();
  return deal;
}

export type CreateDealInput = {
  organizationId: string;
  userId: string;
  customerId: string;
  leadId?: string | null;
  title: string;
  stage?: DealStage;
  amount?: number | string | null;
  currency?: string;
  expectedCloseDate?: Date | null;
  ownerId?: string | null;
  nextAction?: string | null;
  nextActionAt?: Date | null;
  sourceChannel?: string | null;
  sourceContentItemId?: string | null;
  sourcePublishJobId?: string | null;
  lostReason?: string | null;
};

function amountValue(amount: number | string | null | undefined) {
  if (amount === undefined) return undefined;
  if (amount === null) return null;
  return new Prisma.Decimal(amount);
}

export async function createDeal(db: DatabaseClient, input: CreateDealInput) {
  const customer = await db.customer.findFirst({
    where: {
      id: input.customerId,
      organizationId: input.organizationId,
      deletedAt: null
    },
    select: { id: true, displayName: true, channel: true, userId: true }
  });
  if (!customer) throw new DealValidationError('客户不存在');

  if (input.leadId) {
    const lead = await db.lead.findFirst({
      where: {
        id: input.leadId,
        organizationId: input.organizationId,
        customerId: customer.id,
        deletedAt: null
      },
      select: { id: true }
    });
    if (!lead) throw new DealValidationError('线索不属于该客户');
  }

  const stage = input.stage ?? 'new';
  if (!isDealStage(stage)) throw new DealValidationError('商机阶段不合法');
  if (stage === 'lost' && !input.lostReason?.trim()) {
    throw new DealValidationError('标记流失时必须填写原因');
  }

  return db.$transaction(async (tx) => {
    const deal = await tx.deal.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        customerId: customer.id,
        leadId: input.leadId ?? null,
        title: input.title.trim(),
        stage,
        amount: amountValue(input.amount) ?? null,
        currency: input.currency?.trim() || 'CNY',
        expectedCloseDate: input.expectedCloseDate ?? null,
        ownerId: input.ownerId?.trim() || null,
        nextAction: input.nextAction?.trim() || '首次跟进',
        nextActionAt:
          input.nextActionAt === undefined
            ? defaultNextActionAt('B')
            : input.nextActionAt,
        sourceChannel: (input.sourceChannel ?? customer.channel) as never,
        sourceContentItemId: input.sourceContentItemId ?? null,
        sourcePublishJobId: input.sourcePublishJobId ?? null,
        lostReason: stage === 'lost' ? input.lostReason!.trim() : null,
        wonAt: stage === 'won' ? new Date() : null,
        closedAt: isDealClosed(stage) ? new Date() : null
      },
      include: DEAL_INCLUDE
    });

    await tx.dealActivity.create({
      data: {
        dealId: deal.id,
        action: 'created',
        note: `创建商机（${stage}）`,
        operator: input.userId
      }
    });

    if (stage === 'won' || stage === 'lost') {
      await syncDealOutcomeTx(tx, deal.id, input.organizationId, stage, {
        lostReason: input.lostReason,
        operator: input.userId
      });
    }

    return tx.deal.findUniqueOrThrow({
      where: { id: deal.id },
      include: DEAL_INCLUDE
    });
  });
}

export type UpdateDealInput = {
  title?: string;
  stage?: DealStage;
  amount?: number | string | null;
  currency?: string;
  expectedCloseDate?: Date | null;
  ownerId?: string | null;
  nextAction?: string | null;
  nextActionAt?: Date | null;
  sourceChannel?: string | null;
  sourceContentItemId?: string | null;
  sourcePublishJobId?: string | null;
  lostReason?: string | null;
  reopenReason?: string | null;
  operator?: string | null;
};

export async function updateDeal(
  db: DatabaseClient,
  dealId: string,
  organizationId: string,
  input: UpdateDealInput
) {
  const existing = await db.deal.findFirst({
    where: { id: dealId, organizationId, deletedAt: null }
  });
  if (!existing) throw new DealNotFoundError();

  const nextStage = input.stage;
  if (nextStage && nextStage !== existing.stage) {
    try {
      assertDealStageTransition(existing.stage, nextStage);
    } catch (error) {
      if (error instanceof DealStageTransitionError) {
        throw new DealValidationError(error.message);
      }
      throw error;
    }
    const reopen = isDealClosed(existing.stage) && !isDealClosed(nextStage);
    if (reopen && !input.reopenReason?.trim()) {
      throw new DealValidationError('重开商机时必须填写原因');
    }
    if (nextStage === 'lost' && !(input.lostReason ?? existing.lostReason)?.trim()) {
      throw new DealValidationError('标记流失时必须填写原因');
    }
  }

  return db.$transaction(async (tx) => {
    const data: Prisma.DealUpdateInput = {
      ...(input.title !== undefined && { title: input.title.trim() }),
      ...(input.currency !== undefined && {
        currency: input.currency?.trim() || 'CNY'
      }),
      ...(input.expectedCloseDate !== undefined && {
        expectedCloseDate: input.expectedCloseDate
      }),
      ...(input.ownerId !== undefined && {
        ownerId: input.ownerId?.trim() || null
      }),
      ...(input.nextAction !== undefined && {
        nextAction: input.nextAction?.trim() || null
      }),
      ...(input.nextActionAt !== undefined && {
        nextActionAt: input.nextActionAt,
        slaEscalatedAt: null
      }),
      ...(input.sourceChannel !== undefined && {
        sourceChannel: input.sourceChannel as never
      }),
      ...(input.sourceContentItemId !== undefined && {
        sourceContentItemId: input.sourceContentItemId
      }),
      ...(input.sourcePublishJobId !== undefined && {
        sourcePublishJobId: input.sourcePublishJobId
      })
    };
    if (input.amount !== undefined) {
      data.amount = amountValue(input.amount) ?? null;
    }
    if (Object.keys(data).length > 0) {
      await tx.deal.update({ where: { id: dealId }, data });
    }

    if (nextStage && nextStage !== existing.stage) {
      await syncDealOutcomeTx(tx, dealId, organizationId, nextStage, {
        lostReason: input.lostReason ?? existing.lostReason,
        reopenReason: input.reopenReason,
        operator: input.operator ?? null
      });
    }

    return tx.deal.findUniqueOrThrow({
      where: { id: dealId },
      include: {
        ...DEAL_INCLUDE,
        activities: { orderBy: { createdAt: 'desc' } }
      }
    });
  });
}

export async function addDealActivity(
  db: DatabaseClient,
  dealId: string,
  organizationId: string,
  input: {
    action: string;
    note?: string | null;
    nextAction?: string | null;
    nextActionAt?: Date | null;
    operator?: string | null;
  }
) {
  const deal = await db.deal.findFirst({
    where: { id: dealId, organizationId, deletedAt: null },
    select: { id: true }
  });
  if (!deal) throw new DealNotFoundError();

  return db.$transaction(async (tx) => {
    const activity = await tx.dealActivity.create({
      data: {
        dealId,
        action: input.action.trim(),
        note: input.note?.trim() || null,
        operator: input.operator?.trim() || null
      }
    });
    await tx.deal.update({
      where: { id: dealId },
      data: {
        lastContactedAt: new Date(),
        ...(input.nextAction !== undefined && {
          nextAction: input.nextAction?.trim() || null
        }),
        ...(input.nextActionAt !== undefined && {
          nextActionAt: input.nextActionAt,
          slaEscalatedAt: null
        })
      }
    });
    return activity;
  });
}

export async function softDeleteDeal(
  db: DatabaseClient,
  dealId: string,
  organizationId: string,
  operator?: string | null
) {
  const deal = await db.deal.findFirst({
    where: { id: dealId, organizationId, deletedAt: null }
  });
  if (!deal) throw new DealNotFoundError();

  return db.$transaction(async (tx) => {
    await tx.deal.update({
      where: { id: dealId },
      data: { deletedAt: new Date() }
    });
    await tx.dealActivity.create({
      data: {
        dealId,
        action: 'deleted',
        note: '软删除商机',
        operator: operator ?? null
      }
    });
    return { id: dealId, deleted: true };
  });
}

function amountText(value: Prisma.Decimal | null | undefined): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(2);
}

export async function getDealPipeline(
  db: DatabaseClient,
  organizationId: string,
  days = 30
) {
  const since = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
  const [grouped, won] = await Promise.all([
    db.deal.groupBy({
      by: ['stage'],
      where: { organizationId, deletedAt: null },
      _count: { _all: true },
      _sum: { amount: true }
    }),
    db.deal.aggregate({
      where: {
        organizationId,
        deletedAt: null,
        stage: 'won',
        wonAt: { gte: since }
      },
      _count: { _all: true },
      _sum: { amount: true }
    })
  ]);

  const order: DealStage[] = [
    'new',
    'contacted',
    'qualified',
    'proposal',
    'negotiation',
    'won',
    'lost'
  ];
  const stages = order.map((stage) => {
    const row = grouped.find((item) => item.stage === stage);
    return {
      stage,
      count: row?._count._all ?? 0,
      amount: amountText(row?._sum.amount)
    };
  });
  const openStages = new Set(['new', 'contacted', 'qualified', 'proposal', 'negotiation']);
  const open = stages.filter((row) => openStages.has(row.stage));
  const openAmount = open.reduce(
    (total, row) => total + Number(row.amount),
    0
  );

  return {
    stages,
    totals: {
      openCount: open.reduce((total, row) => total + row.count, 0),
      openAmount: openAmount.toFixed(2),
      wonCount: won._count._all,
      wonAmount: amountText(won._sum.amount)
    }
  };
}

export async function listOverdueDeals(
  db: DatabaseClient,
  organizationId: string,
  limit = 200
) {
  const now = new Date();
  return db.deal.findMany({
    where: {
      organizationId,
      deletedAt: null,
      stage: { notIn: ['won', 'lost'] },
      nextActionAt: { lt: now }
    },
    include: DEAL_INCLUDE,
    orderBy: { nextActionAt: 'asc' },
    take: limit
  });
}

export type FollowUpOverdueItem = {
  type: 'lead' | 'customer' | 'deal';
  id: string;
  name: string;
  ownerId: string | null;
  nextAction: string | null;
  nextActionAt: string;
  overdueHours: number;
  href: string;
  amount?: string | null;
};

export async function listOverdueFollowUps(
  db: DatabaseClient,
  organizationId: string,
  options: { ownerId?: string | null; limit?: number } = {}
): Promise<FollowUpOverdueItem[]> {
  const now = new Date();
  const limit = options.limit ?? 200;
  const ownerFilter = options.ownerId
    ? { assignedTo: options.ownerId }
    : {};
  const dealOwnerFilter = options.ownerId ? { ownerId: options.ownerId } : {};

  const [leads, customers, deals] = await Promise.all([
    db.lead.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { notIn: ['WON', 'LOST', 'INVALID'] },
        nextActionAt: { lt: now },
        ...ownerFilter
      },
      select: {
        id: true,
        externalUserName: true,
        externalUserId: true,
        assignedTo: true,
        nextAction: true,
        nextActionAt: true
      },
      take: limit
    }),
    db.customer.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { notIn: ['won', 'lost'] },
        nextActionAt: { lt: now },
        ...ownerFilter
      },
      select: {
        id: true,
        displayName: true,
        assignedTo: true,
        nextAction: true,
        nextActionAt: true
      },
      take: limit
    }),
    db.deal.findMany({
      where: {
        organizationId,
        deletedAt: null,
        stage: { notIn: ['won', 'lost'] },
        nextActionAt: { lt: now },
        ...dealOwnerFilter
      },
      select: {
        id: true,
        title: true,
        ownerId: true,
        nextAction: true,
        nextActionAt: true,
        amount: true
      },
      take: limit
    })
  ]);

  const items: FollowUpOverdueItem[] = [
    ...leads.map((lead) => ({
      type: 'lead' as const,
      id: lead.id,
      name: lead.externalUserName || lead.externalUserId,
      ownerId: lead.assignedTo,
      nextAction: lead.nextAction,
      nextActionAt: lead.nextActionAt!.toISOString(),
      overdueHours: overdueHours(lead.nextActionAt, now),
      href: `/leads/${lead.id}`
    })),
    ...customers.map((customer) => ({
      type: 'customer' as const,
      id: customer.id,
      name: customer.displayName,
      ownerId: customer.assignedTo,
      nextAction: customer.nextAction,
      nextActionAt: customer.nextActionAt!.toISOString(),
      overdueHours: overdueHours(customer.nextActionAt, now),
      href: `/customers/${customer.id}`
    })),
    ...deals.map((deal) => ({
      type: 'deal' as const,
      id: deal.id,
      name: deal.title,
      ownerId: deal.ownerId,
      nextAction: deal.nextAction,
      nextActionAt: deal.nextActionAt!.toISOString(),
      overdueHours: overdueHours(deal.nextActionAt, now),
      href: `/deals/${deal.id}`,
      amount: deal.amount ? deal.amount.toFixed(2) : null
    }))
  ];

  return items
    .sort((a, b) => a.nextActionAt.localeCompare(b.nextActionAt))
    .slice(0, limit);
}
