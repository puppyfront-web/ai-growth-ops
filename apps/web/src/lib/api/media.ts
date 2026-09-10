import { apiGet, apiPost, apiPut, apiUpload } from './client';
import type { MediaAsset } from '@/types/media';

function asAssetList(
  data: MediaAsset[] | { items?: MediaAsset[] }
): MediaAsset[] {
  return Array.isArray(data) ? data : (data.items ?? []);
}

export async function listMediaAssets(filters?: {
  reviewStatus?: string;
  sourceType?: string;
}): Promise<MediaAsset[]> {
  const params = new URLSearchParams();
  if (filters?.reviewStatus) params.set('reviewStatus', filters.reviewStatus);
  if (filters?.sourceType) params.set('sourceType', filters.sourceType);
  const qs = params.toString();
  const data = await apiGet<MediaAsset[] | { items?: MediaAsset[] }>(
    `/api/media-assets${qs ? `?${qs}` : ''}`
  );
  return asAssetList(data);
}

export async function getMediaAssetsByIds(ids: string[]): Promise<MediaAsset[]> {
  if (ids.length === 0) return [];
  const data = await apiGet<MediaAsset[] | { items?: MediaAsset[] }>(
    `/api/media-assets?ids=${ids.join(',')}`
  );
  return asAssetList(data);
}

export function uploadMedia(formData: FormData): Promise<MediaAsset> {
  return apiUpload<MediaAsset>('/api/media-assets', formData);
}

export function reviewMedia(
  id: string,
  status: 'approved' | 'rejected',
  note?: string
): Promise<MediaAsset> {
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
