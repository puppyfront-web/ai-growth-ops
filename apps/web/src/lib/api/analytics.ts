import { apiGet } from './client';
import type {
  AnalyticsOverview,
  PlatformAnalytics,
  ContentRoiItem,
  TrendDataPoint
} from '@/types/analytics';

export function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  return apiGet<AnalyticsOverview>('/api/analytics/overview');
}

export function getPlatformMetrics(): Promise<PlatformAnalytics[]> {
  return apiGet<PlatformAnalytics[]>('/api/analytics/platforms');
}

export function getContentMetrics(): Promise<ContentRoiItem[]> {
  return apiGet<ContentRoiItem[]>('/api/analytics/content-roi');
}

export function getLeadTrend(): Promise<TrendDataPoint[]> {
  return apiGet<TrendDataPoint[]>('/api/analytics/leads/trend');
}

export function getPlatformTrend(): Promise<TrendDataPoint[]> {
  return apiGet<TrendDataPoint[]>('/api/analytics/platforms/trend');
}
