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

export type GenerateContentWithMediaInput = {
  topic: string;
  contentType?: string;
  keywords?: string[];
  brandTone?: string;
  imageStyle?: string;
  imageCount?: number;
};

export type GenerateContentWithMediaResult = {
  contentItem: ContentItem;
  mediaAssets: Array<Record<string, unknown>>;
  skillOutput: Record<string, unknown>;
};

export function generateContentWithMedia(
  data: GenerateContentWithMediaInput
): Promise<GenerateContentWithMediaResult> {
  return apiPost<GenerateContentWithMediaResult>(
    '/api/content-items/generate-with-media',
    data
  );
}

export type ComplianceCheckResult = {
  skillRunId: string;
  passed: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  issues: Array<{ rule: string; message: string; severity: string }>;
  suggestedFixes: Array<{ issue: string; suggestion: string }> | null;
  aiChecked: boolean;
};

export function checkContentCompliance(
  contentItemId: string
): Promise<ComplianceCheckResult> {
  return apiPost<ComplianceCheckResult>(
    `/api/content-items/${contentItemId}/compliance-check`
  );
}

export type AiContentPipelineInput = GenerateContentWithMediaInput & {
  platforms?: string[];
};

export type AiContentPipelineResult = {
  contentItem: ContentItem;
  variants: ContentVariant[];
  compliance: ComplianceCheckResult;
};

/** Chains content-writing → platform-rewrite → compliance-check. */
export async function runAiContentPipeline(
  input: AiContentPipelineInput
): Promise<AiContentPipelineResult> {
  const { platforms, ...generateInput } = input;
  const generated = await generateContentWithMedia(generateInput);
  const variants = await generatePlatformVariants(
    generated.contentItem.id,
    platforms?.length ? platforms : undefined
  );
  const compliance = await checkContentCompliance(generated.contentItem.id);
  return {
    contentItem: generated.contentItem,
    variants,
    compliance
  };
}
