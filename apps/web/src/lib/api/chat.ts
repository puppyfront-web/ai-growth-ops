import { apiGet, apiPost, apiPatch } from './client';

export interface ChatThread {
  id: string;
  organizationId: string;
  userId: string;
  title: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages?: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: unknown;
  toolResult?: unknown;
  tokensUsed?: number;
  createdAt: string;
}

export async function createThread(title?: string): Promise<ChatThread> {
  return apiPost<ChatThread>('/api/chat/threads', { title });
}

export async function listThreads(): Promise<ChatThread[]> {
  return apiGet<ChatThread[]>('/api/chat/threads');
}

export async function getThread(threadId: string): Promise<ChatThread> {
  return apiGet<ChatThread>(`/api/chat/threads/${threadId}`);
}

export async function saveMessage(
  threadId: string,
  message: {
    role: string;
    content: string;
    toolCalls?: unknown;
    toolResult?: unknown;
    tokensUsed?: number;
  }
): Promise<ChatMessage> {
  return apiPost<ChatMessage>(
    `/api/chat/threads/${threadId}/messages`,
    message
  );
}

export async function updateThread(
  threadId: string,
  data: { title?: string; status?: string }
): Promise<ChatThread> {
  return apiPatch<ChatThread>(`/api/chat/threads/${threadId}`, data);
}
