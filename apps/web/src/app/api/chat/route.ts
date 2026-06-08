import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createTools } from './tools/index';
import { buildSystemPrompt } from './system-prompt';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

/** Call backend API with auth context (server-side) */
async function apiCall(path: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const { method = 'GET', body, headers = {} } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

async function fetchUserContext(token: string, orgId: string) {
  const headers = { authorization: `Bearer ${token}`, 'x-organization-id': orgId };
  const [userRes, accountsRes] = await Promise.all([
    fetch(`${API_BASE}/api/auth/me`, { headers: { ...headers, 'content-type': 'application/json' } }),
    fetch(`${API_BASE}/api/accounts`, { headers: { ...headers, 'content-type': 'application/json' } }),
  ]);
  const user = await userRes.json();
  const accounts = await accountsRes.json();
  return { user, accounts: Array.isArray(accounts) ? accounts : [] };
}

export async function POST(req: Request) {
  const body = await req.json();
  const { messages: newMessages, threadId: existingThreadId, token, organizationId } = body;

  if (!token || !organizationId) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401 });
  }

  const authHeaders = {
    authorization: `Bearer ${token}`,
    'x-organization-id': organizationId,
  };

  // Load or create thread (call backend API directly with auth headers)
  let threadId = existingThreadId;
  if (!threadId) {
    const thread = await apiCall('/api/chat/threads', {
      method: 'POST',
      body: {},
      headers: authHeaders,
    });
    threadId = (thread as { id: string }).id;
  }

  // Fetch user context for system prompt
  const { user, accounts } = await fetchUserContext(token, organizationId);
  const systemPrompt = buildSystemPrompt({
    userName: user.name || user.email,
    orgName: user.organization?.name || organizationId,
    platforms: accounts,
    today: new Date().toISOString(),
  });

  // useChat sends the full conversation as newMessages — use it directly.
  // Backend history is only used for persistence (onFinish), not for LLM context,
  // to avoid doubling messages in the LLM prompt.

  // Create tools with auth context
  const tools = createTools({ token, orgId: organizationId });

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = anthropic('claude-sonnet-4-6-20250514');

  const result = streamText({
    model,
    system: systemPrompt,
    messages: newMessages,
    tools,
    maxSteps: 10,
    onFinish: async ({ response }) => {
      // Persist user message + assistant response to backend
      try {
        const lastUserMsg = newMessages[newMessages.length - 1];
        if (lastUserMsg) {
          await apiCall(`/api/chat/threads/${threadId}/messages`, {
            method: 'POST',
            body: { role: lastUserMsg.role, content: lastUserMsg.content },
            headers: authHeaders,
          });
        }
        // Extract text from response messages
        for (const msg of response.messages) {
          if (msg.role === 'assistant') {
            const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            await apiCall(`/api/chat/threads/${threadId}/messages`, {
              method: 'POST',
              body: { role: 'assistant', content: text },
              headers: authHeaders,
            });
          }
        }
      } catch (err) {
        console.error('[chat] Failed to persist messages:', err);
      }
    },
  });

  // Return SSE stream with threadId in header
  const response = result.toDataStreamResponse();
  response.headers.set('X-Thread-Id', threadId);
  return response;
}
