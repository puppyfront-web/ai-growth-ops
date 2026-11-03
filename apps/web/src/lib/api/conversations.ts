import { apiGet, apiPost, apiDelete } from './client';
import type {
  Interaction,
  Conversation,
  ReplySuggestion,
  LeadSummary
} from '@/types/interaction';

export type { LeadSummary };

export async function listInteractions(filters?: {
  status?: string;
  platform?: string;
  type?: string;
}): Promise<Interaction[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.platform) params.set('platform', filters.platform);
  if (filters?.type) params.set('type', filters.type);
  const qs = params.toString();
  const res = await apiGet<{ items: Interaction[]; total: number }>(
    `/api/interactions${qs ? `?${qs}` : ''}`
  );
  // API returns paginated { items, total, ... } — extract the array
  return Array.isArray(res) ? res : (res.items ?? []);
}

export function getConversation(id: string): Promise<Conversation> {
  return apiGet<Conversation>(`/api/conversations/${id}`);
}

export function getReplySuggestions(
  interactionId: string
): Promise<ReplySuggestion[]> {
  return apiGet<ReplySuggestion[]>(
    `/api/interactions/${interactionId}/reply-suggestions`
  );
}

export function sendReply(
  interactionId: string,
  content: string
): Promise<Interaction> {
  return apiPost<Interaction>(`/api/interactions/${interactionId}/reply`, {
    content
  });
}

export function reviewReply(
  interactionId: string,
  action: 'approve' | 'reject' | 'edit',
  content?: string
): Promise<Interaction> {
  return apiPost<Interaction>(`/api/interactions/${interactionId}/review`, {
    action,
    content
  });
}

export function triggerSync(params: {
  platformAccountId: string;
  platform: string;
  mode: string;
  syncType: 'comments' | 'messages' | 'all';
  sourceContentId?: string;
  headed?: boolean;
}): Promise<{ syncJobId: string; status: string; queued: string[] }> {
  return apiPost('/api/interactions/sync', params);
}

export function getSyncStatus(syncJobId: string): Promise<{
  id: string;
  status: string;
  fetchedCount: number | null;
  errorMessage: string | null;
}> {
  return apiGet(`/api/interactions/sync/${syncJobId}`);
}

export function classifyInteraction(id: string): Promise<Interaction> {
  return apiPost<Interaction>(`/api/interactions/${id}/classify`, {});
}

export function suggestReply(id: string): Promise<ReplySuggestion[]> {
  return apiPost<ReplySuggestion[]>(
    `/api/interactions/${id}/suggest-reply`,
    {}
  );
}

export type ConvertInteractionToCustomerResult = {
  customer: { id: string; displayName: string };
  lead: { id: string };
  created: boolean;
};

export function convertToCustomer(
  id: string
): Promise<ConvertInteractionToCustomerResult> {
  return apiPost<ConvertInteractionToCustomerResult>(
    `/api/interactions/${id}/convert-to-customer`,
    {}
  );
}

/** @deprecated 请使用 convertToCustomer，行为已统一写入客户库 */
export function convertToLead(id: string): Promise<ConvertInteractionToCustomerResult> {
  return apiPost<ConvertInteractionToCustomerResult>(
    `/api/interactions/${id}/convert-to-lead`,
    {}
  );
}

export function ignoreInteraction(id: string): Promise<{ ok: boolean }> {
  return apiPost<{ ok: boolean }>(`/api/interactions/${id}/ignore`, {});
}

/* ── 评论/私信用户级黑名单（spec/47 G1）────────────────────────── */

export interface InteractionBlocklistEntry {
  id: string;
  organizationId: string;
  platform: string;
  platformUserId: string;
  reason: string | null;
  note: string | null;
  blockedById: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export function blockTarget(params: {
  platform: string;
  platformUserId: string;
  reason?: 'manual' | 'unsubscribe' | 'complaint';
  note?: string;
}): Promise<InteractionBlocklistEntry> {
  return apiPost<InteractionBlocklistEntry>(
    '/api/interactions/blocklist',
    params
  );
}

export function unblockTarget(id: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/api/interactions/blocklist/${id}`);
}

export async function checkTargetBlocked(
  platform: string,
  platformUserId: string
): Promise<InteractionBlocklistEntry | null> {
  const res = await apiGet<{
    items: InteractionBlocklistEntry[];
    total: number;
  }>(
    `/api/interactions/blocklist?platform=${encodeURIComponent(
      platform
    )}&platformUserId=${encodeURIComponent(platformUserId)}`
  );
  return res.items?.[0] ?? null;
}
