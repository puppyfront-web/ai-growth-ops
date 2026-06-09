/**
 * Engagement Analytics Service
 *
 * Aggregates interaction, reply, and lead data for feedback insights.
 */

import type { DatabaseClient } from '@ai-growth-ops/database';

export interface EngagementMetrics {
  totalInteractions: number;
  interactionsByPlatform: Record<string, number>;
  interactionsByType: Record<string, number>;
  replyRate: number;
  autoReplyRate: number;
  avgClassificationConfidence: number;
  leadConversionRate: number;
  leadsByLevel: Record<string, number>;
  topTopics: Array<{ topic: string; count: number }>;
}

export interface ContentPerformance {
  contentItemId: string;
  title: string;
  interactionCount: number;
  leadCount: number;
  replyCount: number;
  engagementScore: number;
}

/**
 * Aggregate engagement metrics for an organization over a time period.
 */
export async function aggregateEngagementMetrics(
  db: DatabaseClient,
  orgId: string,
  days: number = 7
): Promise<EngagementMetrics> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [interactions, classifications, leads, replySuggestions] =
    await Promise.all([
      // Total interactions in period
      db.interaction.findMany({
        where: {
          organizationId: orgId,
          receivedAt: { gte: since },
          deletedAt: null
        },
        select: { platform: true, type: true, status: true }
      }),
      // Classifications for confidence
      db.interactionClassification.findMany({
        where: {
          interaction: { organizationId: orgId, receivedAt: { gte: since } }
        },
        select: { confidence: true, leadLevel: true }
      }),
      // Leads in period
      db.lead.findMany({
        where: {
          organizationId: orgId,
          createdAt: { gte: since },
          deletedAt: null
        },
        select: { level: true, status: true }
      }),
      // Reply suggestions
      db.replySuggestion.findMany({
        where: {
          interaction: { organizationId: orgId, receivedAt: { gte: since } }
        },
        select: { status: true }
      })
    ]);

  // Aggregate by platform
  const interactionsByPlatform: Record<string, number> = {};
  const interactionsByType: Record<string, number> = {};
  for (const i of interactions) {
    interactionsByPlatform[i.platform] =
      (interactionsByPlatform[i.platform] || 0) + 1;
    interactionsByType[i.type] = (interactionsByType[i.type] || 0) + 1;
  }

  // Reply rate
  const repliedCount = interactions.filter(
    (i) => i.status === 'REPLIED'
  ).length;
  const replyRate =
    interactions.length > 0 ? repliedCount / interactions.length : 0;

  // Auto-reply rate
  const sentReplies = replySuggestions.filter(
    (r) => r.status === 'sent'
  ).length;
  const autoReplyRate =
    replySuggestions.length > 0 ? sentReplies / replySuggestions.length : 0;

  // Average confidence
  const confidences = classifications.map((c) => c.confidence).filter(Boolean);
  const avgClassificationConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

  // Lead conversion
  const leadsByLevel: Record<string, number> = {};
  for (const l of leads) {
    leadsByLevel[l.level] = (leadsByLevel[l.level] || 0) + 1;
  }
  const leadConversionRate =
    interactions.length > 0 ? leads.length / interactions.length : 0;

  return {
    totalInteractions: interactions.length,
    interactionsByPlatform,
    interactionsByType,
    replyRate,
    autoReplyRate,
    avgClassificationConfidence,
    leadConversionRate,
    leadsByLevel,
    topTopics: [] // Would need NLP analysis for real topic extraction
  };
}

/**
 * Compute per-content performance scores based on interactions + leads.
 */
export async function computeContentPerformance(
  db: DatabaseClient,
  orgId: string,
  days: number = 30
): Promise<ContentPerformance[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Find published content with their interactions
  const publishJobs = await db.publishJob.findMany({
    where: {
      organizationId: orgId,
      status: 'PUBLISHED',
      createdAt: { gte: since },
      deletedAt: null
    },
    include: {
      contentVariant: {
        include: {
          contentItem: { select: { id: true, title: true } }
        }
      },
      interactions: { select: { id: true, status: true } },
      leads: { select: { id: true, level: true } }
    }
  });

  // Group by content item
  const byContent = new Map<string, ContentPerformance>();

  for (const job of publishJobs) {
    const ci = job.contentVariant?.contentItem;
    if (!ci) continue;

    const existing = byContent.get(ci.id) || {
      contentItemId: ci.id,
      title: ci.title,
      interactionCount: 0,
      leadCount: 0,
      replyCount: 0,
      engagementScore: 0
    };

    existing.interactionCount += job.interactions.length;
    existing.leadCount += job.leads.length;
    existing.replyCount += job.interactions.filter(
      (i) => i.status === 'REPLIED'
    ).length;

    // Engagement score: weighted combination
    existing.engagementScore =
      existing.interactionCount +
      existing.replyCount * 2 +
      existing.leadCount * 5;

    byContent.set(ci.id, existing);
  }

  return Array.from(byContent.values()).sort(
    (a, b) => b.engagementScore - a.engagementScore
  );
}
