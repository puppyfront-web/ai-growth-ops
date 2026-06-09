import { streamText, stepCountIs } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createTools } from './tools/index';
import { buildSystemPrompt } from './system-prompt';
import { buildOperationalContext } from './context-builder';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

/** Call backend API with auth context (server-side) */
async function apiCall(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
) {
  const { method = 'GET', body, headers = {} } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

async function fetchUserContext(token: string, orgId: string) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    'x-organization-id': orgId,
    'content-type': 'application/json'
  };

  const [userRes, accountsRes] = await Promise.all([
    fetch(`${API_BASE}/api/auth/me`, { headers }),
    fetch(`${API_BASE}/api/accounts`, { headers })
  ]);

  // Gracefully handle API failures — return defaults instead of crashing
  let user: Record<string, unknown> = {};
  if (userRes.ok) {
    user = await userRes.json().catch(() => ({}));
  } else {
    console.error(`[chat] /api/auth/me returned ${userRes.status}`);
  }

  let accounts: unknown[] = [];
  if (accountsRes.ok) {
    const raw = await accountsRes.json().catch(() => []);
    accounts = Array.isArray(raw) ? raw : [];
  } else {
    console.error(`[chat] /api/accounts returned ${accountsRes.status}`);
  }

  return { user, accounts };
}

export async function POST(req: Request) {
  // ── Input validation ───────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: '无效的请求体' }), { status: 400 });
  }

  const { messages: newMessages, threadId: existingThreadId, token, organizationId } = body;

  if (!token || !organizationId) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401 });
  }

  if (!Array.isArray(newMessages) || newMessages.length === 0) {
    return new Response(JSON.stringify({ error: '消息不能为空' }), { status: 400 });
  }

  const authHeaders: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    'x-organization-id': String(organizationId)
  };

  // ── Thread management ──────────────────────────────────────────
  let threadId = existingThreadId as string | undefined;
  if (!threadId) {
    const thread = await apiCall('/api/chat/threads', {
      method: 'POST',
      body: {},
      headers: authHeaders
    });
    threadId = (thread as { id: string }).id;
  }

  // ── Build system prompt (single /api/accounts fetch) ───────────
  const { user, accounts } = await fetchUserContext(String(token), String(organizationId));

  const userName = String((user as Record<string, unknown>)?.name || (user as Record<string, unknown>)?.email || '用户');
  const orgName = String(((user as Record<string, unknown>)?.organization as Record<string, unknown>)?.name || organizationId);

  const basePrompt = buildSystemPrompt({
    userName,
    orgName,
    platforms: accounts as Array<{ id: string; platform: string; name: string; status: string; mode: string }>,
    today: new Date().toISOString()
  });

  // Pass pre-fetched accounts to context builder to avoid duplicate fetch
  const operationalContext = await buildOperationalContext(
    API_BASE,
    authHeaders,
    accounts
  );
  const systemPrompt = basePrompt + operationalContext;

  // ── LLM call ───────────────────────────────────────────────────
  const tools = createTools({ token: String(token), orgId: String(organizationId) });

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = anthropic('claude-sonnet-4-6-20250514');

  const result = streamText({
    model,
    system: systemPrompt,
    messages: newMessages,
    tools,
    stopWhen: stepCountIs(10),
    onFinish: async ({ response }) => {
      // Persist messages in parallel instead of serial
      try {
        const persistJobs: Promise<unknown>[] = [];

        const lastUserMsg = (newMessages as Array<Record<string, unknown>>)[newMessages.length - 1];
        if (lastUserMsg) {
          persistJobs.push(
            apiCall(`/api/chat/threads/${threadId}/messages`, {
              method: 'POST',
              body: { role: lastUserMsg.role, content: lastUserMsg.content },
              headers: authHeaders
            })
          );
        }

        for (const msg of response.messages) {
          if (msg.role === 'assistant') {
            const text =
              typeof msg.content === 'string'
                ? msg.content
                : JSON.stringify(msg.content);
            persistJobs.push(
              apiCall(`/api/chat/threads/${threadId}/messages`, {
                method: 'POST',
                body: { role: 'assistant', content: text },
                headers: authHeaders
              })
            );
          }
        }

        await Promise.allSettled(persistJobs);
      } catch (err) {
        console.error('[chat] Failed to persist messages:', err);
      }
    }
  });

  // Return SSE stream with threadId in header
  const response = result.toUIMessageStreamResponse();
  response.headers.set('X-Thread-Id', threadId);
  return response;
}
