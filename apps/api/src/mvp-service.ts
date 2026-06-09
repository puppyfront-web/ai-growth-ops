import type { DatabaseClient, Platform } from '@ai-growth-ops/database';

export const platformLabels: Record<Platform, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat_official: '微信公众号',
  wechat_channels: '微信视频号',
  baijiahao: '百家号',
  zhihu: '知乎'
};

export interface CustomerDashboard {
  metrics: {
    platformAccounts: number;
    contentItems: number;
    contentVariants: number;
    publishJobs: number;
    publishedJobs: number;
    interactions: number;
    qualifiedLeads: number;
    researchInsights: number;
    contentOpportunities: number;
    providerRuns: number;
  };
  recentPublishJobs: Array<{
    id: string;
    platform: Platform;
    platformLabel: string;
    contentType: string;
    status: string;
    externalUrl: string | null;
  }>;
  leadSummaries: Array<{
    id: string;
    name: string;
    level: string;
    status: string;
    summary: string | null;
  }>;
  insights: Array<{
    id: string;
    title: string;
    summary: string | null;
  }>;
}

export async function getCustomerDashboard(
  db: DatabaseClient,
  userId: string
): Promise<CustomerDashboard> {
  const [
    platformAccounts,
    contentItems,
    contentVariants,
    publishJobs,
    publishedJobs,
    interactions,
    qualifiedLeads,
    researchInsights,
    contentOpportunities,
    providerRuns,
    recentPublishJobs,
    leads,
    insights
  ] = await Promise.all([
    db.platformAccount.count({ where: { userId, deletedAt: null } }),
    db.contentItem.count({ where: { userId, deletedAt: null } }),
    db.contentVariant.count({ where: { userId, deletedAt: null } }),
    db.publishJob.count({ where: { userId, deletedAt: null } }),
    db.publishJob.count({
      where: { userId, status: 'PUBLISHED', deletedAt: null }
    }),
    db.interaction.count({ where: { userId, deletedAt: null } }),
    db.lead.count({
      where: { userId, level: { in: ['A', 'B'] }, deletedAt: null }
    }),
    db.researchInsight.count({ where: { researchTask: { userId } } }),
    db.contentOpportunity.count({ where: { researchTask: { userId } } }),
    db.providerRunLog.count({ where: { status: 'success' } }),
    db.publishJob.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 12
    }),
    db.lead.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 5
    }),
    db.researchInsight.findMany({
      where: { researchTask: { userId } },
      orderBy: { createdAt: 'desc' },
      take: 5
    })
  ]);

  return {
    metrics: {
      platformAccounts,
      contentItems,
      contentVariants,
      publishJobs,
      publishedJobs,
      interactions,
      qualifiedLeads,
      researchInsights,
      contentOpportunities,
      providerRuns
    },
    recentPublishJobs: recentPublishJobs.map((job) => ({
      id: job.id,
      platform: job.platform,
      platformLabel: platformLabels[job.platform],
      contentType: job.contentType,
      status: job.status,
      externalUrl: job.externalUrl
    })),
    leadSummaries: leads.map((lead) => ({
      id: lead.id,
      name: lead.externalUserName ?? lead.externalUserId,
      level: lead.level,
      status: lead.status,
      summary: lead.summary
    })),
    insights: insights.map((insight) => ({
      id: insight.id,
      title: insight.title,
      summary: insight.summary
    }))
  };
}
