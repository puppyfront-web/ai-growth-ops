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
  contentItemId: string;
  title: string;
  type: string;
  publishCount: number;
  publishedCount: number;
  interactionCount: number;
  leadCount: number;
  customerCount: number;
  wonCount: number;
  wonRevenue: string;
  engagementScore: number;
};

export type UnifiedFunnelStage = {
  key: string;
  label: string;
  count: number;
  rateFromPrev: number;
  rateFromStart: number;
  ratioFromPrev: number;
};

export type UnifiedFunnelChannelRow = {
  channel: string;
  leads: number;
  customers: number;
  won: number;
  revenue: string;
};

export type UnifiedFunnelContentRow = {
  contentItemId: string;
  title: string;
  published: number;
  interactions: number;
  leads: number;
  customers: number;
  won: number;
  revenue: string;
};

export type UnifiedFunnelAnalytics = {
  range: { from: string; to: string; days: number };
  stages: UnifiedFunnelStage[];
  revenue: {
    pipelineValue: string;
    wonRevenue: string;
    avgDealSize: string;
    currency: string;
  };
  byChannel: UnifiedFunnelChannelRow[];
  byContent: UnifiedFunnelContentRow[];
  overdue: { leads: number; customers: number; deals: number };
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
