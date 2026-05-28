export type AnalyticsOverview = {
  totalPublished: number;
  totalInteractions: number;
  totalLeads: number;
  totalResearchInsights: number;
  totalContentItems: number;
  totalPublishJobs: number;
  platformAccounts: number;
  contentVariants: number;
  contentOpportunities: number;
  providerRuns: number;
};

export type PlatformAnalytics = {
  platform: string;
  platformLabel: string;
  publishCount: number;
  leadCount: number;
};

export type ContentRoiItem = {
  id: string;
  title: string;
  type: string;
  variantCount: number;
  publishCount: number;
  publishedCount: number;
};

export type TrendDataPoint = {
  date: string;
  [key: string]: string | number;
};
