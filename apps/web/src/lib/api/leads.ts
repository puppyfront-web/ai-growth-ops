import { apiGet, apiPost, apiPut } from './client';
import type { Lead, LeadActivity } from '@/types/lead';

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function listLeads(filters?: {
  level?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<Lead>> {
  const params = new URLSearchParams();
  if (filters?.level) params.set('level', filters.level);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
  const qs = params.toString();
  return apiGet<PaginatedResponse<Lead>>(`/api/leads${qs ? `?${qs}` : ''}`);
}

export function getLead(id: string): Promise<Lead> {
  return apiGet<Lead>(`/api/leads/${id}`);
}

export function updateLeadStatus(id: string, status: string): Promise<Lead> {
  return apiPut<Lead>(`/api/leads/${id}`, { status });
}

/** Update arbitrary lead fields (level, status, assignedTo, nextAction, …). */
export function updateLead(
  id: string,
  data: Partial<{
    level: 'A' | 'B' | 'C' | 'D';
    status: string;
    assignedTo: string;
    nextAction: string;
    intent: string;
    summary: string;
  }>
): Promise<Lead> {
  return apiPut<Lead>(`/api/leads/${id}`, data);
}

/** Convenience: change only the level. */
export function updateLeadLevel(
  id: string,
  level: 'A' | 'B' | 'C' | 'D'
): Promise<Lead> {
  return updateLead(id, { level });
}

/** Assign a lead to a sales rep and move it to ASSIGNED. */
export function assignLead(id: string, assignedTo: string): Promise<Lead> {
  return apiPost<Lead>(`/api/leads/${id}/assign`, { assignedTo });
}

/** Manually create a lead (fallback for offline/exhibition sources). */
export function createLead(data: {
  sourcePlatform: string;
  sourceAccountId: string;
  externalUserId: string;
  externalUserName?: string;
  level?: 'A' | 'B' | 'C' | 'D';
  intent?: string;
  summary?: string;
}): Promise<Lead> {
  return apiPost<Lead>('/api/leads', data);
}

/** Append a follow-up note to a lead's activity timeline. */
export function addLeadActivity(
  leadId: string,
  action: string,
  note?: string
): Promise<LeadActivity> {
  return apiPost<LeadActivity>(`/api/leads/${leadId}/activities`, {
    action,
    note
  });
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

export function getLeadSinkConfig(
  sinkType: 'feishu' | 'wecom'
): Promise<LeadSinkConfig> {
  return apiGet<LeadSinkConfig>(`/api/lead-sinks/${sinkType}`);
}

export function updateLeadSinkConfig(
  sinkType: 'feishu' | 'wecom',
  data: Record<string, unknown>
): Promise<{ ok: boolean }> {
  return apiPut<{ ok: boolean }>(`/api/lead-sinks/${sinkType}`, data);
}
