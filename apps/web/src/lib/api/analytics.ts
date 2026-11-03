import { apiGet } from './client';
import type {
  AnalyticsOverview,
  PlatformAnalytics,
  ContentRoiItem,
  TrendDataPoint,
  AcquisitionAnalytics,
  UnifiedFunnelAnalytics
} from '@/types/analytics';

export function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  return apiGet<AnalyticsOverview>('/api/analytics/overview');
}

export function getPlatformMetrics(): Promise<PlatformAnalytics[]> {
  return apiGet<PlatformAnalytics[]>('/api/analytics/platforms');
}

export function getContentMetrics(days = 30): Promise<ContentRoiItem[]> {
  return apiGet<ContentRoiItem[]>(`/api/analytics/content-roi?days=${days}`);
}

export function getUnifiedFunnel(
  days = 30
): Promise<UnifiedFunnelAnalytics> {
  return apiGet<UnifiedFunnelAnalytics>(`/api/analytics/funnel?days=${days}`);
}

export function getLeadTrend(): Promise<TrendDataPoint[]> {
  return apiGet<TrendDataPoint[]>('/api/analytics/leads/trend');
}

export function getPlatformTrend(): Promise<TrendDataPoint[]> {
  return apiGet<TrendDataPoint[]>('/api/analytics/platforms/trend');
}

export function getAcquisitionAnalytics(
  days = 30
): Promise<AcquisitionAnalytics> {
  return apiGet<AcquisitionAnalytics>(`/api/analytics/acquisition?days=${days}`);
}

export type ProspectOutcomeRow = {
  leadLevel?: string;
  personaTag?: string;
  candidates: number;
  converted: number;
  won: number;
  wonRate: number | null;
};

export type ProspectOutcomeAnalytics = {
  range: { days: number };
  byLevel: ProspectOutcomeRow[];
  byPersona: ProspectOutcomeRow[];
  byScoringVersion: Array<{ version: string; candidates: number }>;
  summary: {
    candidates: number;
    converted: number;
    won: number;
    wonRate: number | null;
    scoringSnapshotCoverage: number | null;
    conversionSnapshotCoverage: number | null;
  };
};

export function getProspectOutcomeAnalytics(
  days = 30
): Promise<ProspectOutcomeAnalytics> {
  return apiGet<ProspectOutcomeAnalytics>(
    `/api/analytics/prospect-outcomes?days=${days}`
  );
}
