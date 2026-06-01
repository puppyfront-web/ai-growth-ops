import { apiGet, apiPost, apiPut } from './client';
import type { Lead, LeadActivity } from '@/types/lead';

export function listLeads(filters?: { level?: string; status?: string }): Promise<Lead[]> {
  const params = new URLSearchParams();
  if (filters?.level) params.set('level', filters.level);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  return apiGet<Lead[]>(`/api/leads${qs ? `?${qs}` : ''}`);
}

export function getLead(id: string): Promise<Lead> {
  return apiGet<Lead>(`/api/leads/${id}`);
}

export function updateLeadStatus(id: string, status: string): Promise<Lead> {
  return apiPut<Lead>(`/api/leads/${id}`, { status });
}

export function getLeadActivities(leadId: string): Promise<LeadActivity[]> {
  return apiGet<LeadActivity[]>(`/api/leads/${leadId}/activities`);
}

export function syncLeadToFeishu(id: string): Promise<{ success: boolean }> {
  return apiPost(`/api/leads/${id}/sync-feishu`);
}

export function syncLeadToWecom(id: string): Promise<{ success: boolean }> {
  return apiPost(`/api/leads/${id}/sync-wecom`);
}

export type LeadSinkConfig = {
  id?: string;
  enabled?: boolean;
  lastSyncAt?: string | null;
} & Record<string, unknown>;

export function getLeadSinkConfig(sinkType: 'feishu' | 'wecom'): Promise<LeadSinkConfig> {
  return apiGet<LeadSinkConfig>(`/api/lead-sinks/${sinkType}`);
}

export function updateLeadSinkConfig(sinkType: 'feishu' | 'wecom', data: Record<string, unknown>): Promise<{ ok: boolean }> {
  return apiPut<{ ok: boolean }>(`/api/lead-sinks/${sinkType}`, data);
}
