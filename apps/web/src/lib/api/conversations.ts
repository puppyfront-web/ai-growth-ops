import { apiGet, apiPost } from './client';
import type { Interaction, Conversation, ReplySuggestion } from '@/types/interaction';

export async function listInteractions(filters?: { status?: string; platform?: string; type?: string }): Promise<Interaction[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.platform) params.set('platform', filters.platform);
  if (filters?.type) params.set('type', filters.type);
  const qs = params.toString();
  const res = await apiGet<{ items: Interaction[]; total: number }>(`/api/interactions${qs ? `?${qs}` : ''}`);
  // API returns paginated { items, total, ... } — extract the array
  return Array.isArray(res) ? res : (res.items ?? []);
}

export function getConversation(id: string): Promise<Conversation> {
  return apiGet<Conversation>(`/api/conversations/${id}`);
}

export function getReplySuggestions(interactionId: string): Promise<ReplySuggestion[]> {
  return apiGet<ReplySuggestion[]>(`/api/interactions/${interactionId}/reply-suggestions`);
}

export function sendReply(interactionId: string, content: string): Promise<Interaction> {
  return apiPost<Interaction>(`/api/interactions/${interactionId}/reply`, { content });
}

export function reviewReply(interactionId: string, action: 'approve' | 'reject' | 'edit', content?: string): Promise<Interaction> {
  return apiPost<Interaction>(`/api/interactions/${interactionId}/review`, { action, content });
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

export function getSyncStatus(syncJobId: string): Promise<{ id: string; status: string; fetchedCount: number | null; errorMessage: string | null }> {
  return apiGet(`/api/interactions/sync/${syncJobId}`);
}

export function classifyInteraction(id: string): Promise<Interaction> {
  return apiPost<Interaction>(`/api/interactions/${id}/classify`, {});
}

export function suggestReply(id: string): Promise<ReplySuggestion[]> {
  return apiPost<ReplySuggestion[]>(`/api/interactions/${id}/suggest-reply`, {});
}

export function convertToLead(id: string): Promise<{ ok: boolean }> {
  return apiPost<{ ok: boolean }>(`/api/interactions/${id}/convert-to-lead`, {});
}

export function ignoreInteraction(id: string): Promise<{ ok: boolean }> {
  return apiPost<{ ok: boolean }>(`/api/interactions/${id}/ignore`, {});
}
