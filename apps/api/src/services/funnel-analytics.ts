import type { DatabaseClient } from '@ai-growth-ops/database';
import {
  buildContentRoi,
  buildUnifiedFunnel,
  resolveAcquisitionRange,
  type ContentRoiInputRow,
  type UnifiedFunnelAnalytics
} from '@ai-growth-ops/shared';

const OPEN_DEAL_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation'];

function inRange(value: Date | null, from: Date, to: Date): boolean {
  if (!value) return false;
  const time = value.getTime();
  return time >= from.getTime() && time <= to.getTime();
}

export type ContentRoiResult = ReturnType<typeof buildContentRoi>;

export async function getContentRoiRows(
  db: DatabaseClient,
  organizationId: string,
  days: number
): Promise<ContentRoiInputRow[]> {
  const range = resolveAcquisitionRange(days);
  const items = await db.contentItem.findMany({
    where: { organizationId, deletedAt: null },
    select: {
      id: true,
      title: true,
      type: true,
      contentVariants: {
        select: {
          publishJobs: {
            where: { deletedAt: null },
            select: {
              id: true,
              status: true,
              finishedAt: true,
              createdAt: true
            }
          }
        }
      }
    }
  });

  const jobToContent = new Map<string, string>();
  for (const item of items) {
    for (const variant of item.contentVariants) {
      for (const job of variant.publishJobs) {
        jobToContent.set(job.id, item.id);
      }
    }
  }
  const jobIds = [...jobToContent.keys()];
  if (jobIds.length === 0) return [];

  const [interactions, leads] = await Promise.all([
    db.interaction.findMany({
      where: {
        organizationId,
        publishJobId: { in: jobIds },
        receivedAt: { gte: range.from, lte: range.to },
        deletedAt: null
      },
      select: { publishJobId: true }
    }),
    db.lead.findMany({
      where: {
        organizationId,
        sourcePublishJobId: { in: jobIds },
        createdAt: { gte: range.from, lte: range.to },
        deletedAt: null
      },
      select: {
        sourcePublishJobId: true,
        customerId: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    })
  ]);

  const interactionCountByJob = new Map<string, number>();
  for (const interaction of interactions) {
    if (!interaction.publishJobId) continue;
    interactionCountByJob.set(
      interaction.publishJobId,
      (interactionCountByJob.get(interaction.publishJobId) ?? 0) + 1
    );
  }

  const leadCountByJob = new Map<string, number>();
  const firstTouchByCustomer = new Map<string, string>();
  for (const lead of leads) {
    if (!lead.sourcePublishJobId) continue;
    leadCountByJob.set(
      lead.sourcePublishJobId,
      (leadCountByJob.get(lead.sourcePublishJobId) ?? 0) + 1
    );
    if (lead.customerId && !firstTouchByCustomer.has(lead.customerId)) {
      firstTouchByCustomer.set(lead.customerId, lead.sourcePublishJobId);
    }
  }

  const customerIds = [...firstTouchByCustomer.keys()];
  const wonDeals = customerIds.length
    ? await db.deal.findMany({
        where: {
          organizationId,
          deletedAt: null,
          stage: 'won',
          wonAt: { gte: range.from, lte: range.to },
          customerId: { in: customerIds }
        },
        select: {
          customerId: true,
          sourcePublishJobId: true,
          amount: true
        }
      })
    : [];

  const customerCountByJob = new Map<string, number>();
  for (const jobId of firstTouchByCustomer.values()) {
    customerCountByJob.set(jobId, (customerCountByJob.get(jobId) ?? 0) + 1);
  }

  const wonCountByJob = new Map<string, number>();
  const wonRevenueByJob = new Map<string, number>();
  for (const deal of wonDeals) {
    const jobId =
      deal.sourcePublishJobId && jobToContent.has(deal.sourcePublishJobId)
        ? deal.sourcePublishJobId
        : firstTouchByCustomer.get(deal.customerId);
    if (!jobId) continue;
    wonCountByJob.set(jobId, (wonCountByJob.get(jobId) ?? 0) + 1);
    wonRevenueByJob.set(
      jobId,
      (wonRevenueByJob.get(jobId) ?? 0) + Number(deal.amount ?? 0)
    );
  }

  return items
    .map((item) => {
      const jobs = item.contentVariants.flatMap(
        (variant) => variant.publishJobs
      );
      const publishedInRange = jobs.filter(
        (job) =>
          job.status === 'PUBLISHED' &&
          (inRange(job.finishedAt, range.from, range.to) ||
            (!job.finishedAt && inRange(job.createdAt, range.from, range.to)))
      ).length;
      const count = (map: Map<string, number>) =>
        jobs.reduce((total, job) => total + (map.get(job.id) ?? 0), 0);

      return {
        contentItemId: item.id,
        title: item.title,
        type: item.type,
        publishCount: jobs.length,
        publishedCount: publishedInRange,
        interactionCount: count(interactionCountByJob),
        leadCount: count(leadCountByJob),
        customerCount: count(customerCountByJob),
        wonCount: count(wonCountByJob),
        wonRevenue: count(wonRevenueByJob)
      };
    })
    .filter(
      (row) =>
        row.publishCount > 0 ||
        row.interactionCount > 0 ||
        row.leadCount > 0
    );
}

export async function getContentRoi(
  db: DatabaseClient,
  organizationId: string,
  days: number
): Promise<ContentRoiResult> {
  return buildContentRoi(await getContentRoiRows(db, organizationId, days));
}

export async function getUnifiedFunnel(
  db: DatabaseClient,
  organizationId: string,
  days: number,
  now = new Date()
): Promise<UnifiedFunnelAnalytics> {
  const range = resolveAcquisitionRange(days, now);
  const notDeleted = { organizationId, deletedAt: null };
  const createdInRange = { gte: range.from, lte: range.to };

  const [
    published,
    interactions,
    leads,
    customers,
    deals,
    won,
    pipeline,
    wonRevenue,
    leadsByPlatform,
    customersByChannel,
    wonDealsByCustomer,
    overdueLeads,
    overdueCustomers,
    overdueDeals,
    contentRows
  ] = await Promise.all([
    db.publishJob.count({
      where: {
        ...notDeleted,
        status: 'PUBLISHED',
        OR: [
          { finishedAt: createdInRange },
          { finishedAt: null, createdAt: createdInRange }
        ]
      }
    }),
    db.interaction.count({
      where: {
        ...notDeleted,
        receivedAt: createdInRange
      }
    }),
    db.lead.count({ where: { ...notDeleted, createdAt: createdInRange } }),
    db.customer.count({ where: { ...notDeleted, createdAt: createdInRange } }),
    db.deal.count({ where: { ...notDeleted, createdAt: createdInRange } }),
    db.deal.count({
      where: { ...notDeleted, stage: 'won', wonAt: createdInRange }
    }),
    db.deal.aggregate({
      where: { ...notDeleted, stage: { in: OPEN_DEAL_STAGES as never } },
      _sum: { amount: true }
    }),
    db.deal.aggregate({
      where: { ...notDeleted, stage: 'won', wonAt: createdInRange },
      _sum: { amount: true }
    }),
    db.lead.groupBy({
      by: ['sourcePlatform'],
      where: { ...notDeleted, createdAt: createdInRange },
      _count: { _all: true }
    }),
    db.customer.groupBy({
      by: ['channel'],
      where: { ...notDeleted, createdAt: createdInRange },
      _count: { _all: true }
    }),
    db.deal.findMany({
      where: { ...notDeleted, stage: 'won', wonAt: createdInRange },
      select: {
        amount: true,
        customer: { select: { channel: true } }
      }
    }),
    db.lead.count({
      where: {
        organizationId,
        deletedAt: null,
        status: { notIn: ['WON', 'LOST', 'INVALID'] },
        nextActionAt: { lt: now }
      }
    }),
    db.customer.count({
      where: {
        organizationId,
        deletedAt: null,
        status: { notIn: ['won', 'lost'] },
        nextActionAt: { lt: now }
      }
    }),
    db.deal.count({
      where: {
        organizationId,
        deletedAt: null,
        stage: { notIn: ['won', 'lost'] },
        nextActionAt: { lt: now }
      }
    }),
    getContentRoiRows(db, organizationId, range.days)
  ]);

  const channelMap = new Map<
    string,
    { leads: number; customers: number; won: number; revenue: number }
  >();
  const channelRow = (channel: string) => {
    const current = channelMap.get(channel) ?? {
      leads: 0,
      customers: 0,
      won: 0,
      revenue: 0
    };
    channelMap.set(channel, current);
    return current;
  };
  for (const row of leadsByPlatform) {
    channelRow(row.sourcePlatform).leads += row._count._all;
  }
  for (const row of customersByChannel) {
    channelRow(row.channel).customers += row._count._all;
  }
  for (const deal of wonDealsByCustomer) {
    const row = channelRow(deal.customer.channel);
    row.won += 1;
    row.revenue += Number(deal.amount ?? 0);
  }

  const byContent = [...contentRows]
    .sort(
      (a, b) => b.leadCount - a.leadCount || b.publishedCount - a.publishedCount
    )
    .slice(0, 20);

  return buildUnifiedFunnel({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    days: range.days,
    published,
    interactions,
    leads,
    customers,
    deals,
    won,
    pipelineValue: Number(pipeline._sum.amount ?? 0),
    wonRevenue: Number(wonRevenue._sum.amount ?? 0),
    byChannel: [...channelMap.entries()].map(([channel, row]) => ({
      channel,
      ...row
    })),
    byContent: byContent.map((row) => ({
      contentItemId: row.contentItemId,
      title: row.title,
      published: row.publishedCount,
      interactions: row.interactionCount,
      leads: row.leadCount,
      customers: row.customerCount,
      won: row.wonCount,
      revenue: row.wonRevenue
    })),
    overdue: {
      leads: overdueLeads,
      customers: overdueCustomers,
      deals: overdueDeals
    }
  });
}
