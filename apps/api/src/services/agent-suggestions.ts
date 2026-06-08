import type { DatabaseClient } from '@ai-growth-ops/database';

export interface Suggestion {
  id: string;
  priority: 'high' | 'medium' | 'low' | 'info';
  category: string;
  title: string;
  description: string;
  actionPrompt: string;
}

export async function generateProactiveSuggestions(
  db: DatabaseClient,
  orgId: string,
): Promise<Suggestion[]> {
  const suggestions: Suggestion[] = [];
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  // 1. Failed publishes
  const failedPublishes = await db.publishJob.count({
    where: {
      organizationId: orgId,
      status: { in: ['FAILED', 'NEED_MANUAL_REPAIR'] },
      createdAt: { gte: dayAgo },
    },
  });
  if (failedPublishes > 0) {
    suggestions.push({
      id: 'failed-publishes',
      priority: 'high',
      category: '发布',
      title: `${failedPublishes} 个发布任务失败`,
      description: '有发布任务失败需要处理，可能影响内容排期。',
      actionPrompt: `查看失败的发布任务并帮我重试`,
    });
  }

  // 2. Pending reply reviews
  const pendingReviews = await db.replySuggestion.count({
    where: {
      status: 'waiting_review',
      interaction: { organizationId: orgId },
    },
  });
  if (pendingReviews > 0) {
    suggestions.push({
      id: 'pending-reviews',
      priority: 'high',
      category: '互动',
      title: `${pendingReviews} 条回复待审核`,
      description: '有自动回复建议等待你的审核批准。',
      actionPrompt: `查看待审核的回复建议`,
    });
  }

  // 3. Unread interactions
  const unreadInteractions = await db.interaction.count({
    where: {
      organizationId: orgId,
      status: 'NEW',
      createdAt: { gte: dayAgo },
    },
  });
  if (unreadInteractions > 10) {
    suggestions.push({
      id: 'unread-interactions',
      priority: 'medium',
      category: '互动',
      title: `${unreadInteractions} 条新互动未处理`,
      description: '评论和私信积压较多，建议及时处理以免错过高价值线索。',
      actionPrompt: `帮我查看最新的评论和私信`,
    });
  }

  // 4. Stale content drafts (> 3 days)
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const staleDrafts = await db.contentItem.count({
    where: {
      organizationId: orgId,
      status: 'draft',
      createdAt: { lte: threeDaysAgo },
      deletedAt: null,
    },
  });
  if (staleDrafts > 0) {
    suggestions.push({
      id: 'stale-drafts',
      priority: 'low',
      category: '内容',
      title: `${staleDrafts} 篇草稿超过 3 天未发布`,
      description: '有内容草稿积压，建议完成并发布。',
      actionPrompt: `查看草稿中的内容并帮我发布`,
    });
  }

  // 5. Level A/B leads with no recent activity
  const hotLeadsStale = await db.lead.count({
    where: {
      organizationId: orgId,
      level: { in: ['A', 'B'] },
      status: { notIn: ['WON', 'LOST'] },
      updatedAt: { lte: twoDaysAgo },
    },
  });
  if (hotLeadsStale > 0) {
    suggestions.push({
      id: 'stale-hot-leads',
      priority: 'medium',
      category: '线索',
      title: `${hotLeadsStale} 个高价值线索超过 48 小时未跟进`,
      description: 'A级或B级线索需要及时跟进，避免流失。',
      actionPrompt: `查看待跟进的高价值线索`,
    });
  }

  // 6. Active campaigns approaching next run
  const upcomingCampaigns = await db.campaign.count({
    where: {
      organizationId: orgId,
      status: 'active',
      nextRunAt: { lte: new Date(now.getTime() + 2 * 60 * 60 * 1000) },
    },
  });
  if (upcomingCampaigns > 0) {
    suggestions.push({
      id: 'upcoming-campaigns',
      priority: 'info',
      category: '活动',
      title: `${upcomingCampaigns} 个运营活动即将执行`,
      description: '有活动将在 2 小时内自动执行内容生成和发布。',
      actionPrompt: `查看即将执行的运营活动`,
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2, info: 3 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions.slice(0, 5);
}
