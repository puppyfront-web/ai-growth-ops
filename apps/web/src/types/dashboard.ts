export type DashboardMetrics = {
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

export type DashboardData = {
  metrics: DashboardMetrics;
  recentPublishJobs: Array<{
    id: string;
    platform: string;
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
};
