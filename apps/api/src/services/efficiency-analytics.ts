import type { DatabaseClient } from '@ai-growth-ops/database';
import { getCostSummary } from '@ai-growth-ops/database';
import {
  attributeRevenue,
  resolveAcquisitionRange,
  type AttributionModel,
  type AttributionTouch
} from '@ai-growth-ops/shared';
import { getUnifiedFunnel } from './funnel-analytics.js';

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100) / 100;
}

export async function getEfficiencyAnalytics(
  db: DatabaseClient,
  organizationId: string,
  days: number
) {
  const range = resolveAcquisitionRange(days);
  const [funnel, costs] = await Promise.all([
    getUnifiedFunnel(db, organizationId, days),
    getCostSummary(db, organizationId, range.from, range.to)
  ]);

  const costByChannel = new Map(
    costs.byChannel.map((row) => [row.channel, row.amount])
  );
  const funnelChannels = new Map(
    funnel.byChannel.map((row) => [row.channel, row])
  );
  const channels = new Set([
    ...costByChannel.keys(),
    ...funnelChannels.keys()
  ]);

  const byChannel = [...channels]
    .map((channel) => {
      const spend = costByChannel.get(channel) ?? 0;
      const row = funnelChannels.get(channel);
      const leads = row?.leads ?? 0;
      const customers = row?.customers ?? 0;
      const won = row?.won ?? 0;
      const revenue = Number(row?.revenue ?? 0);
      return {
        channel,
        spend,
        leads,
        customers,
        won,
        revenue,
        cpl: ratio(spend, leads),
        cac: ratio(spend, won),
        roi: spend > 0 ? Math.round(((revenue - spend) / spend) * 100) / 100 : 0
      };
    })
    .sort((a, b) => b.spend - a.spend || b.revenue - a.revenue);

  const leads = funnel.stages.find((stage) => stage.key === 'leads')?.count ?? 0;
  const won = funnel.stages.find((stage) => stage.key === 'won')?.count ?? 0;
  const revenue = Number(funnel.revenue.wonRevenue);

  return {
    range: funnel.range,
    totals: {
      spend: costs.total,
      revenue,
      leads,
      won,
      cpl: ratio(costs.total, leads),
      cac: ratio(costs.total, won),
      roi:
        costs.total > 0
          ? Math.round(((revenue - costs.total) / costs.total) * 100) / 100
          : 0
    },
    byChannel,
    byCategory: costs.byCategory
  };
}

export async function getAttributionAnalytics(
  db: DatabaseClient,
  organizationId: string,
  days: number,
  model: AttributionModel
) {
  const range = resolveAcquisitionRange(days);

  const [outreachTouches, leads, deals] = await Promise.all([
    db.outreachTouch.findMany({
      where: {
        organizationId,
        status: { in: ['sent', 'replied'] },
        OR: [
          { sentAt: { gte: range.from, lte: range.to } },
          { repliedAt: { gte: range.from, lte: range.to } }
        ]
      },
      select: {
        id: true,
        channel: true,
        sentAt: true,
        repliedAt: true,
        enrollment: { select: { customerId: true } }
      }
    }),
    db.lead.findMany({
      where: {
        organizationId,
        createdAt: { gte: range.from, lte: range.to },
        deletedAt: null,
        customerId: { not: null }
      },
      select: {
        id: true,
        customerId: true,
        sourcePlatform: true,
        createdAt: true,
        publishJob: {
          select: {
            contentVariant: { select: { contentItemId: true } }
          }
        }
      }
    }),
    db.deal.findMany({
      where: {
        organizationId,
        deletedAt: null,
        stage: 'won',
        wonAt: { gte: range.from, lte: range.to }
      },
      select: {
        id: true,
        customerId: true,
        amount: true,
        wonAt: true
      }
    })
  ]);

  const touches: AttributionTouch[] = [
    ...outreachTouches
      .filter((touch) => touch.enrollment.customerId)
      .map((touch) => ({
        id: touch.id,
        customerId: touch.enrollment.customerId,
        channel: touch.channel,
        contentItemId: null,
        occurredAt: (
          touch.sentAt ??
          touch.repliedAt ??
          range.from
        ).toISOString()
      })),
    ...leads
      .filter((lead) => lead.customerId)
      .map((lead) => ({
        id: `lead:${lead.id}`,
        customerId: lead.customerId!,
        channel: lead.sourcePlatform,
        contentItemId: lead.publishJob?.contentVariant.contentItemId ?? null,
        occurredAt: lead.createdAt.toISOString()
      }))
  ];

  const result = attributeRevenue(
    deals
      .filter((deal) => deal.wonAt)
      .map((deal) => ({
        id: deal.id,
        customerId: deal.customerId,
        amount: Number(deal.amount ?? 0),
        wonAt: deal.wonAt!.toISOString()
      })),
    touches,
    model
  );

  return {
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      days: range.days
    },
    ...result
  };
}
