import { apiGet, apiPost, apiPut } from './client';
import type { MediaAsset } from '@/types/media';

export function listMediaAssets(filters?: { reviewStatus?: string; sourceType?: string }): Promise<MediaAsset[]> {
  const params = new URLSearchParams();
  if (filters?.reviewStatus) params.set('reviewStatus', filters.reviewStatus);
  if (filters?.sourceType) params.set('sourceType', filters.sourceType);
  const qs = params.toString();
  return apiGet<MediaAsset[]>(`/api/media-assets${qs ? `?${qs}` : ''}`);
}

export function getMediaAssetsByIds(ids: string[]): Promise<MediaAsset[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return apiGet<MediaAsset[]>(`/api/media-assets?ids=${ids.join(',')}`);
}

export function uploadMedia(formData: FormData): Promise<MediaAsset> {
  return fetch('/api/media-assets', { method: 'POST', body: formData }).then((r) => r.json());
}

export function reviewMedia(id: string, status: 'approved' | 'rejected', note?: string): Promise<MediaAsset> {
  return apiPut<MediaAsset>(`/api/media-assets/${id}/review`, { status, note });
}

export function generateMedia(params: {
  prompt: string;
  generationType: string;
  style?: string;
  size?: string;
}): Promise<MediaAsset> {
  return apiPost<MediaAsset>('/api/media-assets/generate', params);
}
