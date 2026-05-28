import { apiGet, apiPost } from './client';
import type { ResearchTask, CollectedPost, CollectedComment, ResearchInsight, ContentOpportunity } from '@/types/research';

export function listResearchTasks(): Promise<ResearchTask[]> {
  return apiGet<ResearchTask[]>('/api/research-tasks');
}

export function getResearchTask(id: string): Promise<ResearchTask> {
  return apiGet<ResearchTask>(`/api/research-tasks/${id}`);
}

export function createResearchTask(data: Partial<ResearchTask>): Promise<ResearchTask> {
  return apiPost<ResearchTask>('/api/research-tasks', data);
}

export function runResearchTask(id: string): Promise<ResearchTask> {
  return apiPost<ResearchTask>(`/api/research-tasks/${id}/run`);
}

export function getCollectedPosts(taskId: string): Promise<CollectedPost[]> {
  return apiGet<CollectedPost[]>(`/api/research-tasks/${taskId}/posts`);
}

export function getCollectedComments(taskId: string): Promise<CollectedComment[]> {
  return apiGet<CollectedComment[]>(`/api/research-tasks/${taskId}/comments`);
}

export function listInsights(): Promise<ResearchInsight[]> {
  return apiGet<ResearchInsight[]>('/api/research-insights');
}

export function listOpportunities(): Promise<ContentOpportunity[]> {
  return apiGet<ContentOpportunity[]>('/api/content-opportunities');
}

export function createContentFromOpportunity(opportunityId: string): Promise<{ contentItemId: string }> {
  return apiPost(`/api/content-opportunities/${opportunityId}/create-content`);
}
