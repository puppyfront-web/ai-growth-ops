import { apiGet } from './client';
import type { DashboardData } from '@/types/dashboard';

export function getDashboard(): Promise<DashboardData> {
  return apiGet<DashboardData>('/api/dashboard');
}
