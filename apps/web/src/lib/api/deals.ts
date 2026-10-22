import { apiDelete, apiGet, apiPost, apiPut } from './client';
import type {
  CreateDealInput,
  Deal,
  DealActivity,
  DealPipeline,
  FollowUpOverdueItem,
  UpdateDealInput
} from '@/types/deal';

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function listDeals(filters?: {
  stage?: string;
  customerId?: string;
  ownerId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<Deal>> {
  const params = new URLSearchParams();
  if (filters?.stage) params.set('stage', filters.stage);
  if (filters?.customerId) params.set('customerId', filters.customerId);
  if (filters?.ownerId) params.set('ownerId', filters.ownerId);
  if (filters?.q) params.set('q', filters.q);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
  const qs = params.toString();
  return apiGet<PaginatedResponse<Deal>>(
    `/api/deals${qs ? `?${qs}` : ''}`
  );
}

export function getDeal(id: string): Promise<Deal> {
  return apiGet<Deal>(`/api/deals/${id}`);
}

export function createDeal(input: CreateDealInput): Promise<Deal> {
  return apiPost<Deal>('/api/deals', input);
}

export function updateDeal(id: string, input: UpdateDealInput): Promise<Deal> {
  return apiPut<Deal>(`/api/deals/${id}`, input);
}

export function addDealActivity(
  id: string,
  input: {
    action: string;
    note?: string;
    nextAction?: string | null;
    nextActionAt?: string | null;
  }
): Promise<DealActivity> {
  return apiPost<DealActivity>(`/api/deals/${id}/activities`, input);
}

export function deleteDeal(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiDelete(`/api/deals/${id}`);
}

export function getDealPipeline(days = 30): Promise<DealPipeline> {
  return apiGet<DealPipeline>(`/api/deals/pipeline?days=${days}`);
}

export function listOverdueDeals(): Promise<{ items: Deal[] }> {
  return apiGet<{ items: Deal[] }>('/api/deals/overdue');
}

export function listOverdueFollowUps(
  ownerId?: string
): Promise<{ items: FollowUpOverdueItem[]; total: number }> {
  const params = new URLSearchParams();
  if (ownerId) params.set('ownerId', ownerId);
  const qs = params.toString();
  return apiGet<{ items: FollowUpOverdueItem[]; total: number }>(
    `/api/follow-ups/overdue${qs ? `?${qs}` : ''}`
  );
}
