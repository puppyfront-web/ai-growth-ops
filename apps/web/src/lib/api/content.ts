import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { ContentItem, ContentVariant } from '@/types/content';

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function listContentItems(
  page?: number,
  pageSize?: number
): Promise<PaginatedResponse<ContentItem>> {
  const params = new URLSearchParams();
  if (page) params.set('page', String(page));
  if (pageSize) params.set('pageSize', String(pageSize));
  const qs = params.toString();
  return apiGet<PaginatedResponse<ContentItem>>(
    `/api/content-items${qs ? `?${qs}` : ''}`
  );
}

export function getContentItem(id: string): Promise<ContentItem> {
  return apiGet<ContentItem>(`/api/content-items/${id}`);
}

export function createContentItem(
  data: Partial<ContentItem>
): Promise<ContentItem> {
  return apiPost<ContentItem>('/api/content-items', data);
}

export function updateContentItem(
  id: string,
  data: Partial<ContentItem> & { mediaAssetIds?: string[] }
): Promise<ContentItem> {
  return apiPut<ContentItem>(`/api/content-items/${id}`, data);
}

export function getContentVariants(
  contentItemId: string
): Promise<PaginatedResponse<ContentVariant>> {
  return apiGet<PaginatedResponse<ContentVariant>>(
    `/api/content-items/${contentItemId}/variants`
  );
}

export function generatePlatformVariants(
  contentItemId: string,
  platforms?: string[]
): Promise<ContentVariant[]> {
  return apiPost<ContentVariant[]>(
    `/api/content-items/${contentItemId}/generate-variants`,
    platforms ? { platforms } : {}
  );
}

export function updateContentVariant(
  variantId: string,
  data: { title?: string; body?: string; tags?: string[] }
): Promise<ContentVariant> {
  return apiPut<ContentVariant>(`/api/content-variants/${variantId}`, data);
}

export function deleteContentItem(id: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/api/content-items/${id}`);
}

export function archiveContentItem(id: string): Promise<ContentItem> {
  return apiPut<ContentItem>(`/api/content-items/${id}`, {
    status: 'archived'
  });
}

export function batchCreatePublishJobs(data: {
  contentItemId: string;
  platformAccountIds: string[];
  scheduledAt?: string;
}): Promise<Record<string, unknown>[]> {
  return apiPost('/api/publish-jobs/batch', data);
}
