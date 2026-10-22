import { Prisma } from '@prisma/client';
import type { DatabaseClient } from './client.js';

export type CostCategory = 'ad' | 'content' | 'labor' | 'tool' | 'other';

export async function listMarketingCosts(
  db: DatabaseClient,
  organizationId: string,
  filters: { from?: Date; to?: Date; channel?: string } = {}
) {
  return db.marketingCost.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(filters.channel ? { channel: filters.channel as never } : {}),
      ...(filters.from || filters.to
        ? {
            incurredAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {})
            }
          }
        : {})
    },
    orderBy: { incurredAt: 'desc' },
    take: 500
  });
}

export async function createMarketingCost(
  db: DatabaseClient,
  input: {
    organizationId: string;
    userId: string;
    channel?: string | null;
    contentItemId?: string | null;
    category?: CostCategory;
    amount: number;
    currency?: string;
    incurredAt?: Date;
    note?: string | null;
  }
) {
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new Error('成本金额必须是非负数');
  }
  return db.marketingCost.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      channel: (input.channel ?? null) as never,
      contentItemId: input.contentItemId ?? null,
      category: input.category ?? 'ad',
      amount: new Prisma.Decimal(input.amount.toFixed(2)),
      currency: input.currency?.trim() || 'CNY',
      incurredAt: input.incurredAt ?? new Date(),
      note: input.note?.trim() || null
    }
  });
}

export async function updateMarketingCost(
  db: DatabaseClient,
  costId: string,
  organizationId: string,
  input: {
    channel?: string | null;
    contentItemId?: string | null;
    category?: CostCategory;
    amount?: number;
    currency?: string;
    incurredAt?: Date;
    note?: string | null;
  }
) {
  const existing = await db.marketingCost.findFirst({
    where: { id: costId, organizationId, deletedAt: null }
  });
  if (!existing) throw new Error('成本记录不存在');
  if (
    input.amount !== undefined &&
    (!Number.isFinite(input.amount) || input.amount < 0)
  ) {
    throw new Error('成本金额必须是非负数');
  }
  return db.marketingCost.update({
    where: { id: costId },
    data: {
      ...(input.channel !== undefined && { channel: input.channel as never }),
      ...(input.contentItemId !== undefined && {
        contentItemId: input.contentItemId
      }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.amount !== undefined && {
        amount: new Prisma.Decimal(input.amount.toFixed(2))
      }),
      ...(input.currency !== undefined && {
        currency: input.currency.trim() || 'CNY'
      }),
      ...(input.incurredAt !== undefined && { incurredAt: input.incurredAt }),
      ...(input.note !== undefined && { note: input.note?.trim() || null })
    }
  });
}

export async function deleteMarketingCost(
  db: DatabaseClient,
  costId: string,
  organizationId: string
) {
  const result = await db.marketingCost.updateMany({
    where: { id: costId, organizationId, deletedAt: null },
    data: { deletedAt: new Date() }
  });
  if (result.count === 0) throw new Error('成本记录不存在');
  return { id: costId, deleted: true };
}

export async function getCostSummary(
  db: DatabaseClient,
  organizationId: string,
  from: Date,
  to: Date
) {
  const costs = await db.marketingCost.findMany({
    where: {
      organizationId,
      deletedAt: null,
      incurredAt: { gte: from, lte: to }
    },
    select: {
      channel: true,
      category: true,
      amount: true,
      contentItemId: true
    }
  });

  const byChannel = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const byContent = new Map<string, number>();
  let total = 0;
  for (const cost of costs) {
    const amount = Number(cost.amount);
    total += amount;
    const channel = cost.channel ?? 'other';
    byChannel.set(channel, (byChannel.get(channel) ?? 0) + amount);
    byCategory.set(cost.category, (byCategory.get(cost.category) ?? 0) + amount);
    if (cost.contentItemId) {
      byContent.set(
        cost.contentItemId,
        (byContent.get(cost.contentItemId) ?? 0) + amount
      );
    }
  }

  return {
    total: Math.round(total * 100) / 100,
    byChannel: [...byChannel.entries()]
      .map(([channel, amount]) => ({ channel, amount }))
      .sort((a, b) => b.amount - a.amount),
    byCategory: [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    byContent: [...byContent.entries()]
      .map(([contentItemId, amount]) => ({ contentItemId, amount }))
      .sort((a, b) => b.amount - a.amount)
  };
}
