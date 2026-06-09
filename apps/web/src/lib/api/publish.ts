import { apiGet, apiPost, apiDelete } from './client';
import type { PublishJob, PublishAttempt } from '@/types/publish';

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function listPublishJobs(filters?: {
  status?: string;
  platform?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<PublishJob>> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.platform) params.set('platform', filters.platform);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
  const qs = params.toString();
  return apiGet<PaginatedResponse<PublishJob>>(
    `/api/publish-jobs${qs ? `?${qs}` : ''}`
  );
}

export function getPublishJob(id: string): Promise<PublishJob> {
  return apiGet<PublishJob>(`/api/publish-jobs/${id}`);
}

export function getPublishAttempts(jobId: string): Promise<PublishAttempt[]> {
  return apiGet<PublishAttempt[]>(`/api/publish-jobs/${jobId}/attempts`);
}

export function createPublishJob(
  data: Partial<PublishJob>
): Promise<PublishJob> {
  return apiPost<PublishJob>('/api/publish-jobs', data);
}

export function retryPublishJob(id: string): Promise<PublishJob> {
  return apiPost<PublishJob>(`/api/publish-jobs/${id}/retry`);
}

export function cancelPublishJob(id: string): Promise<PublishJob> {
  return apiPost<PublishJob>(`/api/publish-jobs/${id}/cancel`);
}

export function executePublishJob(id: string): Promise<PublishJob> {
  return apiPost<PublishJob>(`/api/publish-jobs/${id}/execute`);
}

export function deletePublishJob(id: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/api/publish-jobs/${id}`);
}
