import type { DatabaseClient } from '@ai-growth-ops/database';
import {
  asKeywordList,
  buildAcquisitionAnalytics,
  resolveAcquisitionRange,
  type AcquisitionAnalytics
} from '@ai-growth-ops/shared';

export async function getAcquisitionAnalytics(
  db: DatabaseClient,
  organizationId: string,
  days: number,
  now = new Date()
): Promise<AcquisitionAnalytics> {
  const range = resolveAcquisitionRange(days, now);
  const createdAt = { gte: range.from, lte: range.to };

  const [tasks, candidates] = await Promise.all([
    db.prospectingTask.findMany({
      where: { organizationId, createdAt },
      select: {
        id: true,
        platform: true,
        keywords: true,
        status: true,
        totalVideos: true,
        totalComments: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    }),
    db.prospectCandidate.findMany({
      where: { organizationId, createdAt },
      select: {
        id: true,
        prospectingTaskId: true,
        platform: true,
        keyword: true,
        relevanceScore: true,
        leadLevel: true,
        customerId: true,
        createdAt: true,
        metadata: true
      }
    })
  ]);

  const customerIds = [
    ...new Set(
      candidates
        .map((row) => row.customerId)
        .filter((id): id is string => Boolean(id))
    )
  ];
  const customers = customerIds.length
    ? await db.customer.findMany({
        where: {
          organizationId,
          id: { in: customerIds },
          deletedAt: null
        },
        select: {
          id: true,
          status: true,
          channel: true,
          fitScore: true,
          intentScore: true,
          healthScore: true,
          segment: true,
          createdAt: true
        }
      })
    : [];

  return buildAcquisitionAnalytics({
    from: range.from,
    to: range.to,
    days: range.days,
    tasks: tasks.map((task) => ({
      id: task.id,
      platform: task.platform,
      keywords: asKeywordList(task.keywords),
      status: task.status,
      totalVideos: task.totalVideos,
      totalComments: task.totalComments,
      createdAt: task.createdAt.toISOString()
    })),
    candidates: candidates.map((row) => {
      const metadata =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      return {
        id: row.id,
        taskId: row.prospectingTaskId,
        platform: row.platform,
        keyword: row.keyword,
        relevanceScore: row.relevanceScore,
        leadLevel: row.leadLevel,
        customerId: row.customerId,
        createdAt: row.createdAt.toISOString(),
        convertedAt:
          typeof metadata.convertedAt === 'string' ? metadata.convertedAt : null
      };
    }),
    customers: customers.map((row) => ({
      id: row.id,
      status: row.status,
      channel: row.channel,
      fitScore: row.fitScore,
      intentScore: row.intentScore,
      healthScore: row.healthScore,
      segment: row.segment,
      createdAt: row.createdAt.toISOString()
    }))
  });
}
