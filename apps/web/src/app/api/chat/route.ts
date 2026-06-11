import { streamText, stepCountIs, type ModelMessage, type LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createTools } from './tools/index';
import { buildSystemPrompt } from './system-prompt';
import { buildOperationalContext } from './context-builder';

/**
 * Normalize messages from the client into ModelMessage[] format.
 * assistant-ui may send extra fields (id, createdAt, status, etc.)
 * that Vercel AI SDK's schema validation rejects.
 */
function normalizeMessages(raw: unknown[]): ModelMessage[] {
  return raw.map((msg: unknown) => {
    const m = msg as Record<string, unknown>;
    const role = String(m.role);
    const content = typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content)
        ? m.content
        : String(m.content ?? '');
    return { role, content } as ModelMessage;
  });
}

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
  try {
    return await handleChat(req);
  } catch (err) {
    // Catch-all: never let Next.js return an HTML error page.
    // This prevents the chat UI from displaying raw HTML to the user.
    const message =
      err instanceof Error ? err.message : '聊天服务暂时不可用，请稍后重试';
    console.error('[chat] Unhandled error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}

async function handleChat(req: Request) {
  // ── Input validation ───────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: '无效的请求体' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  const {
    messages: newMessages,
    threadId: existingThreadId,
    token,
    organizationId
  } = body;

  if (!token || !organizationId) {
    return new Response(JSON.stringify({ error: '未登录' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    });
  }

  if (!Array.isArray(newMessages) || newMessages.length === 0) {
    return new Response(JSON.stringify({ error: '消息不能为空' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
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
  const { user, accounts } = await fetchUserContext(
    String(token),
    String(organizationId)
  );

  const userName = String(
    (user as Record<string, unknown>)?.name ||
      (user as Record<string, unknown>)?.email ||
      '用户'
  );
  const orgName = String(
    ((user as Record<string, unknown>)?.organization as Record<string, unknown>)
      ?.name || organizationId
  );

  const basePrompt = buildSystemPrompt({
    userName,
    orgName,
    platforms: accounts as Array<{
      id: string;
      platform: string;
      name: string;
      status: string;
      mode: string;
    }>,
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
  const tools = createTools({
    token: String(token),
    orgId: String(organizationId)
  });

  // Read AI config from backend — use the internal endpoint that returns the actual apiKey.
  // The public GET /api/settings/ai masks the key for browser safety.
  let aiConfig: { provider: string; apiKey: string; baseUrl: string; model: string };
  try {
    const configRes = await fetch(`${API_BASE}/api/settings/ai/internal`, {
      headers: authHeaders
    });
    if (configRes.ok) {
      const configBody = await configRes.json() as Record<string, unknown>;
      aiConfig = {
        provider: (configBody.provider as string) || 'openai',
        apiKey: (configBody.apiKey as string) || '',
        baseUrl: (configBody.baseUrl as string) || '',
        model: (configBody.model as string) || 'gpt-4o'
      };
    } else {
      // Fallback to public endpoint (won't have apiKey) + env vars
      const fallbackRes = await fetch(`${API_BASE}/api/settings/ai`, {
        headers: authHeaders
      });
      const fallbackBody = fallbackRes.ok
        ? (await fallbackRes.json() as Record<string, unknown>)
        : {};
      aiConfig = {
        provider: (fallbackBody.provider as string) || process.env.AI_PROVIDER || 'openai',
        apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
        baseUrl: (fallbackBody.baseUrl as string) || process.env.AI_BASE_URL || '',
        model: (fallbackBody.model as string) || process.env.AI_MODEL || 'gpt-4o'
      };
    }
  } catch {
    aiConfig = {
      provider: process.env.AI_PROVIDER || 'openai',
      apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
      baseUrl: process.env.AI_BASE_URL || '',
      model: process.env.AI_MODEL || 'gpt-4o'
    };
  }

  if (!aiConfig.apiKey) {
    return new Response(
      JSON.stringify({ error: '请先在「设置 > AI」中配置 API Key' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  let model: LanguageModel;
  if (aiConfig.provider === 'anthropic') {
    const anthropic = createAnthropic({
      apiKey: aiConfig.apiKey,
      ...(aiConfig.baseUrl ? { baseURL: aiConfig.baseUrl } : {})
    });
    model = anthropic(aiConfig.model || 'claude-sonnet-4-6-20250514');
  } else {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const openai = createOpenAI({
      apiKey: aiConfig.apiKey,
      ...(aiConfig.baseUrl ? { baseURL: aiConfig.baseUrl } : {})
    });
    model = openai(aiConfig.model || 'gpt-4o');
  }

  const result = streamText({
    model,
    system: systemPrompt,
    messages: normalizeMessages(newMessages),
    tools,
    stopWhen: stepCountIs(10),
    onFinish: async ({ response }) => {
      // Persist messages in parallel instead of serial
      try {
        const persistJobs: Promise<unknown>[] = [];

        const lastUserMsg = (newMessages as Array<Record<string, unknown>>)[
          newMessages.length - 1
        ];
        if (lastUserMsg) {
          persistJobs.push(
            apiCall(`/api/chat/threads/${threadId}/messages`, {
              method: 'POST',
              body: {
                role: lastUserMsg.role,
                content: lastUserMsg.content
              },
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
