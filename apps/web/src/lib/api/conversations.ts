import { apiGet, apiPost } from './client';
import type { Interaction, Conversation, ReplySuggestion } from '@/types/interaction';

export function listInteractions(filters?: { status?: string; platform?: string; type?: string }): Promise<Interaction[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.platform) params.set('platform', filters.platform);
  if (filters?.type) params.set('type', filters.type);
  const qs = params.toString();
  return apiGet<Interaction[]>(`/api/interactions${qs ? `?${qs}` : ''}`);
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
}): Promise<{ syncJobId: string; status: string; queued: string[] }> {
  return apiPost('/api/interactions/sync', params);
}

export function getSyncStatus(syncJobId: string): Promise<{ id: string; status: string; fetchedCount: number | null; errorMessage: string | null }> {
  return apiGet(`/api/interactions/sync/${syncJobId}`);
}
