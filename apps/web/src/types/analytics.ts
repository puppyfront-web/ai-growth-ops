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

export type AcquisitionFunnelStage = {
  key: string;
  label: string;
  count: number;
  rateFromPrev: number;
  rateFromStart: number;
};

export type AcquisitionCountRow = {
  key: string;
  label?: string;
  count: number;
  converted: number;
};

export type AcquisitionKeywordRow = {
  keyword: string;
  candidates: number;
  avgScore: number;
  converted: number;
  conversionRate: number;
};

export type AcquisitionTaskSummary = {
  id: string;
  platform: string;
  keywords: string[];
  status: string;
  videos: number;
  comments: number;
  candidates: number;
  converted: number;
  createdAt: string;
};

export type AcquisitionAnalytics = {
  range: { from: string; to: string; days: number };
  kpis: {
    tasks: number;
    completedTasks: number;
    videos: number;
    comments: number;
    candidates: number;
    highIntent: number;
    convertedCustomers: number;
    conversionRate: number;
    wonCustomers: number;
    avgScore: number;
  };
  funnel: AcquisitionFunnelStage[];
  trend: Array<{ date: string; candidates: number; converted: number }>;
  byLevel: AcquisitionCountRow[];
  byScoreBand: AcquisitionCountRow[];
  byPlatform: AcquisitionCountRow[];
  byKeyword: AcquisitionKeywordRow[];
  byCustomerStatus: Array<{ status: string; count: number }>;
  recentTasks: AcquisitionTaskSummary[];
};
