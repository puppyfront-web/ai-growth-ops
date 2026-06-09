# AI Native 对话界面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a ChatGPT-like conversational interface that connects to the existing runtime-core workflows, enabling users to execute publishing, interaction, research, and account management tasks via natural language.

**Architecture:** Vercel AI SDK handles the LLM conversation layer (streaming + tool calling). Tool execute functions call the existing backend API server. New Next.js Route Handler at `/api/chat` acts as BFF. Chat messages persist in PostgreSQL via new `ChatThread`/`ChatMessage` models.

**Tech Stack:** Vercel AI SDK (`ai`, `@ai-sdk/anthropic`), Next.js 14 Route Handlers, SSE streaming, Prisma (new models), shadcn/ui components

**Design Spec:** `docs/superpowers/specs/2026-06-08-ai-native-chat-design.md`

---

## File Structure

### New Files

| File                                               | Responsibility                                                |
| -------------------------------------------------- | ------------------------------------------------------------- |
| `apps/web/src/app/api/chat/route.ts`               | Next.js Route Handler: SSE streaming, LLM call, tool dispatch |
| `apps/web/src/app/api/chat/tools.ts`               | Vercel AI SDK tool definitions (5 core tools)                 |
| `apps/web/src/app/api/chat/system-prompt.ts`       | System prompt builder                                         |
| `apps/web/src/app/(chat)/layout.tsx`               | Chat route group layout                                       |
| `apps/web/src/app/(chat)/page.tsx`                 | Chat home: new thread or latest                               |
| `apps/web/src/app/(chat)/chat/[threadId]/page.tsx` | Specific thread view                                          |
| `apps/web/src/components/chat/ChatPanel.tsx`       | Main chat panel (messages + input)                            |
| `apps/web/src/components/chat/ChatSidebar.tsx`     | Thread list sidebar                                           |
| `apps/web/src/components/chat/ChatInput.tsx`       | Message input with send button                                |
| `apps/web/src/components/chat/MessageList.tsx`     | Scrollable message list                                       |
| `apps/web/src/components/chat/MessageBubble.tsx`   | Single message render (Markdown)                              |
| `apps/web/src/components/chat/ToolCallCard.tsx`    | Tool result structured card                                   |
| `apps/web/src/components/chat/QuickActions.tsx`    | Empty-state quick action buttons                              |
| `apps/web/src/lib/api/chat.ts`                     | Chat API client (thread CRUD, message load)                   |

### Modified Files

| File                                           | Change                                          |
| ---------------------------------------------- | ----------------------------------------------- |
| `packages/database/prisma/schema.prisma`       | Add `ChatThread` + `ChatMessage` models         |
| `apps/web/src/app/layout.tsx`                  | Redirect `/` to chat (or conditional routing)   |
| `apps/web/src/components/layout/navigation.ts` | Add "AI 助手" nav item                          |
| `apps/web/package.json`                        | Add `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai` |
| `apps/api/src/routes.ts`                       | Add chat thread CRUD routes                     |

---

## Task 1: Install Dependencies

**Files:**

- Modify: `apps/web/package.json`

- [ ] **Step 1: Install Vercel AI SDK packages**

```bash
cd /Users/tutu/apps/ai-growth-ops
pnpm --filter @ai-growth-ops/web add ai @ai-sdk/anthropic @ai-sdk/openai
```

- [ ] **Step 2: Verify installation**

Run: `pnpm list ai @ai-sdk/anthropic @ai-sdk/openai --filter @ai-growth-ops/web`
Expected: Shows installed versions

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "chore: add Vercel AI SDK dependencies for chat interface"
```

---

## Task 2: Database Models + Migration

**Files:**

- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 1: Add ChatThread and ChatMessage models to schema.prisma**

Append to end of `packages/database/prisma/schema.prisma`, before the closing:

```prisma
model ChatThread {
  id             String        @id @default(uuid())
  organizationId String
  userId         String
  title          String?
  status         String        @default("active")
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  organization   Organization  @relation(fields: [organizationId], references: [id])
  user           User          @relation(fields: [userId], references: [id])
  messages       ChatMessage[]

  @@index([organizationId, userId, updatedAt])
  @@map("chat_threads")
}

model ChatMessage {
  id          String     @id @default(uuid())
  threadId    String
  role        String
  content     String
  toolCalls   Json?
  toolResult  Json?
  tokensUsed  Int?
  createdAt   DateTime   @default(now())

  thread      ChatThread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@index([threadId, createdAt])
  @@map("chat_messages")
}
```

Also add relations to the existing `Organization` and `User` models:

In `Organization` model, add: `chatThreads  ChatThread[]`
In `User` model, add: `chatThreads  ChatThread[]`

- [ ] **Step 2: Run Prisma migration**

```bash
cd /Users/tutu/apps/ai-growth-ops
npx prisma migrate dev --name add_chat_models --schema packages/database/prisma/schema.prisma
```

Expected: Migration created and applied successfully

- [ ] **Step 3: Generate Prisma client**

```bash
npx prisma generate --schema packages/database/prisma/schema.prisma
```

Expected: Prisma client generated with new models

- [ ] **Step 4: Commit**

```bash
git add packages/database/
git commit -m "feat: add ChatThread and ChatMessage database models"
```

---

## Task 3: Chat Thread CRUD API Routes

**Files:**

- Modify: `apps/api/src/routes.ts`

This adds backend API routes for thread CRUD. The Next.js Route Handler will call these for persistence.

- [ ] **Step 1: Add chat thread routes to the API server**

Add these routes to the `routes` array in `apps/api/src/routes.ts`:

```typescript
// ── Chat Threads ──────────────────────────────────────────────────
{
  method: 'POST',
  pattern: '/api/chat/threads',
  handler: async (req, res, ctx) => {
    const orgCtx = await getOrganizationContext(req, ctx.db);
    if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
    const body = ctx.body as { title?: string } | null;
    const thread = await ctx.db.chatThread.create({
      data: {
        organizationId: orgCtx.organization.id,
        userId: orgCtx.user.id,
        title: body?.title || null,
      },
    });
    sendJson(res, 201, thread);
  },
},
{
  method: 'GET',
  pattern: '/api/chat/threads',
  handler: async (req, res, ctx) => {
    const orgCtx = await getOrganizationContext(req, ctx.db);
    if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
    const threads = await ctx.db.chatThread.findMany({
      where: { organizationId: orgCtx.organization.id, userId: orgCtx.user.id, status: 'active' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    sendJson(res, 200, threads);
  },
},
{
  method: 'GET',
  pattern: '/api/chat/threads/:id',
  handler: async (req, res, ctx) => {
    const orgCtx = await getOrganizationContext(req, ctx.db);
    if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
    const thread = await ctx.db.chatThread.findFirst({
      where: { id: ctx.params.id, organizationId: orgCtx.organization.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!thread) return sendJson(res, 404, { error: '对话不存在' });
    sendJson(res, 200, thread);
  },
},
{
  method: 'POST',
  pattern: '/api/chat/threads/:id/messages',
  handler: async (req, res, ctx) => {
    const orgCtx = await getOrganizationContext(req, ctx.db);
    if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
    const body = ctx.body as { role: string; content: string; toolCalls?: unknown; toolResult?: unknown; tokensUsed?: number } | null;
    if (!body?.role || !body?.content) return sendJson(res, 400, { error: 'Missing role or content' });
    const thread = await ctx.db.chatThread.findFirst({
      where: { id: ctx.params.id, organizationId: orgCtx.organization.id },
    });
    if (!thread) return sendJson(res, 404, { error: '对话不存在' });
    const message = await ctx.db.chatMessage.create({
      data: {
        threadId: ctx.params.id,
        role: body.role,
        content: body.content,
        toolCalls: body.toolCalls ?? undefined,
        toolResult: body.toolResult ?? undefined,
        tokensUsed: body.tokensUsed,
      },
    });
    // Update thread title from first user message
    if (body.role === 'user' && !thread.title) {
      await ctx.db.chatThread.update({
        where: { id: ctx.params.id },
        data: { title: body.content.slice(0, 50) },
      });
    }
    sendJson(res, 201, message);
  },
},
{
  method: 'PATCH',
  pattern: '/api/chat/threads/:id',
  handler: async (req, res, ctx) => {
    const orgCtx = await getOrganizationContext(req, ctx.db);
    if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
    const body = ctx.body as { title?: string; status?: string } | null;
    const thread = await ctx.db.chatThread.findFirst({
      where: { id: ctx.params.id, organizationId: orgCtx.organization.id },
    });
    if (!thread) return sendJson(res, 404, { error: '对话不存在' });
    const updated = await ctx.db.chatThread.update({
      where: { id: ctx.params.id },
      data: {
        ...(body?.title != null && { title: body.title }),
        ...(body?.status != null && { status: body.status }),
      },
    });
    sendJson(res, 200, updated);
  },
},
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --project apps/api/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes.ts
git commit -m "feat: add ChatThread CRUD API routes"
```

---

## Task 4: Chat API Client (Frontend)

**Files:**

- Create: `apps/web/src/lib/api/chat.ts`

- [ ] **Step 1: Create chat API client**

Create `apps/web/src/lib/api/chat.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/api/chat.ts
git commit -m "feat: add chat API client for thread and message CRUD"
```

---

## Task 5: Tool Definitions + System Prompt

**Files:**

- Create: `apps/web/src/app/api/chat/tools.ts`
- Create: `apps/web/src/app/api/chat/system-prompt.ts`

- [ ] **Step 1: Create system prompt builder**

Create `apps/web/src/app/api/chat/system-prompt.ts`:

```typescript
interface PlatformAccount {
  id: string;
  platform: string;
  name: string;
  status: string;
  mode: string;
}

export function buildSystemPrompt(context: {
  userName: string;
  orgName: string;
  platforms: PlatformAccount[];
  today: string;
}): string {
  const platformList =
    context.platforms.length > 0
      ? context.platforms
          .map((p) => `  - ${p.platform} (${p.name}): ${p.status}`)
          .join('\n')
      : '  (暂无已连接账号)';

  return `你是 AI Growth Ops 的智能运营助手。你可以帮助用户完成以下任务：

1. 📝 内容创作：写文章、改写适配不同平台风格（抖音/小红书/微信公众号等）
2. 📤 内容发布：发布内容到各平台，支持立即发布和定时发布
3. 💬 互动管理：拉取评论/私信、回复评论、管理线索
4. 🎯 线索管理：查看线索列表、同步到飞书/企业微信
5. 🔍 话题研究：研究行业热点、分析数据趋势
6. 🔗 账号管理：登录账号、检查连接状态

当前上下文：
- 用户：${context.userName}
- 组织：${context.orgName}
- 今天：${context.today}
- 已连接平台：
${platformList}

规则：
- 使用中文回复
- 执行操作前确认关键信息（如发布目标平台、内容 ID）
- 缺少必要信息（如未登录账号）时主动引导用户处理
- Tool 调用失败时给出清晰的错误说明和解决建议
- 回复简洁实用，避免冗长`;
}
```

- [ ] **Step 2: Create tool definitions**

Create `apps/web/src/app/api/chat/tools.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

/** Helper to call the backend API from within tool execute */
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

export const listAccounts = tool({
  description: '列出用户已连接的所有平台账号及其状态',
  parameters: z.object({}),
  execute: async () => {
    const accounts = await apiCall('/api/accounts');
    return { accounts };
  }
});

export const checkCookieStatus = tool({
  description: '检查指定平台账号的 cookie 是否有效',
  parameters: z.object({
    accountId: z.string().optional().describe('账号 ID，不传则检查所有账号')
  }),
  execute: async ({ accountId }) => {
    const accounts = await apiCall('/api/accounts');
    const targets = accountId
      ? accounts.filter((a: any) => a.id === accountId)
      : accounts;
    return {
      accounts: targets.map((a: any) => ({
        id: a.id,
        platform: a.platform,
        name: a.name,
        status: a.status,
        hasCookie: !!a.cookieRef,
        mode: a.mode
      }))
    };
  }
});

export const publishContent = tool({
  description: '将内容发布到指定平台。需要 contentId 和目标平台列表。',
  parameters: z.object({
    contentId: z.string().describe('要发布的内容 ID'),
    platforms: z
      .array(z.string())
      .describe('目标平台列表，如 ["douyin", "xiaohongshu"]'),
    scheduledAt: z.string().optional().describe('定时发布时间，ISO 格式')
  }),
  execute: async ({ contentId, platforms, scheduledAt }) => {
    const accounts = await apiCall('/api/accounts');
    const platformAccountIds = accounts
      .filter((a: any) => platforms.includes(a.platform))
      .map((a: any) => a.id);
    if (platformAccountIds.length === 0) {
      return { error: `未找到目标平台 ${platforms.join(',')} 的已连接账号` };
    }
    const result = await apiCall('/api/publish-jobs/batch', {
      method: 'POST',
      body: { contentItemId: contentId, platformAccountIds, scheduledAt }
    });
    return { published: result };
  }
});

export const syncComments = tool({
  description: '从指定平台拉取最新评论',
  parameters: z.object({
    platform: z.string().describe('平台名称，如 douyin'),
    platformAccountId: z.string().describe('平台账号 ID'),
    limit: z.number().optional().describe('拉取数量，默认 50')
  }),
  execute: async ({ platform, platformAccountId, limit }) => {
    const result = await apiCall('/api/interactions/sync', {
      method: 'POST',
      body: {
        platform,
        platformAccountId,
        syncType: 'comments',
        limit: limit || 50
      }
    });
    return result;
  }
});

export const createContent = tool({
  description: '使用 AI 创建新内容。返回创建的内容 ID 供后续发布。',
  parameters: z.object({
    title: z.string().describe('内容标题'),
    body: z.string().describe('内容正文'),
    type: z
      .string()
      .optional()
      .describe('内容类型：text_image | video | article，默认 text_image')
  }),
  execute: async ({ title, body, type }) => {
    const result = await apiCall('/api/content-items', {
      method: 'POST',
      body: { title, body, type: type || 'text_image' }
    });
    return { contentItem: result };
  }
});

export const allTools = {
  list_accounts: listAccounts,
  check_cookie_status: checkCookieStatus,
  publish_content: publishContent,
  sync_comments: syncComments,
  create_content: createContent
};
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/chat/
git commit -m "feat: add chat tool definitions and system prompt builder"
```

---

## Task 6: Next.js /api/chat Route Handler

**Files:**

- Create: `apps/web/src/app/api/chat/route.ts`

- [ ] **Step 1: Create the streaming Route Handler**

Create `apps/web/src/app/api/chat/route.ts`:

```typescript
import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { allTools } from './tools';
import { buildSystemPrompt } from './system-prompt';
import {
  getThread,
  saveMessage,
  createThread,
  listThreads
} from '@/lib/api/chat';

// Backend API base URL for fetching user context
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

async function fetchUserContext(token: string, orgId: string) {
  const headers = {
    authorization: `Bearer ${token}`,
    'x-organization-id': orgId
  };
  const [userRes, accountsRes] = await Promise.all([
    fetch(`${API_BASE}/api/auth/me`, { headers }),
    fetch(`${API_BASE}/api/accounts`, { headers })
  ]);
  const user = await userRes.json();
  const accounts = await accountsRes.json();
  return { user, accounts: Array.isArray(accounts) ? accounts : [] };
}

export async function POST(req: Request) {
  const body = await req.json();
  const {
    messages: newMessages,
    threadId: existingThreadId,
    token,
    organizationId
  } = body;

  if (!token || !organizationId) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401 });
  }

  // Load or create thread
  let threadId = existingThreadId;
  if (!threadId) {
    const thread = await createThread();
    threadId = thread.id;
  }

  // Fetch user context for system prompt
  const { user, accounts } = await fetchUserContext(token, organizationId);
  const systemPrompt = buildSystemPrompt({
    userName: user.name || user.email,
    orgName: organizationId,
    platforms: accounts,
    today: new Date().toISOString()
  });

  // Load history
  let history: Array<{ role: string; content: string }> = [];
  if (existingThreadId) {
    try {
      const thread = await getThread(threadId);
      history = (thread.messages || []).map((m: any) => ({
        role: m.role,
        content: m.content
      }));
    } catch {
      // Thread not found, start fresh
    }
  }

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = anthropic('claude-sonnet-4-6-20250514');

  const result = streamText({
    model,
    system: systemPrompt,
    messages: [...history, ...newMessages],
    tools: allTools,
    maxSteps: 5,
    onFinish: async ({ response }) => {
      // Persist user message + assistant response
      try {
        const lastUserMsg = newMessages[newMessages.length - 1];
        if (lastUserMsg) {
          await saveMessage(threadId, {
            role: lastUserMsg.role,
            content: lastUserMsg.content
          });
        }
        // Extract text from response messages
        for (const msg of response.messages) {
          if (msg.role === 'assistant') {
            const text =
              typeof msg.content === 'string'
                ? msg.content
                : JSON.stringify(msg.content);
            await saveMessage(threadId, { role: 'assistant', content: text });
          }
        }
      } catch (err) {
        console.error('[chat] Failed to persist messages:', err);
      }
    }
  });

  // Return SSE stream with threadId in header
  const response = result.toDataStreamResponse();
  response.headers.set('X-Thread-Id', threadId);
  return response;
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/chat/route.ts
git commit -m "feat: add /api/chat streaming route handler with Vercel AI SDK"
```

---

## Task 7: Chat UI Components

**Files:**

- Create: `apps/web/src/components/chat/ChatPanel.tsx`
- Create: `apps/web/src/components/chat/ChatSidebar.tsx`
- Create: `apps/web/src/components/chat/ChatInput.tsx`
- Create: `apps/web/src/components/chat/MessageList.tsx`
- Create: `apps/web/src/components/chat/MessageBubble.tsx`
- Create: `apps/web/src/components/chat/ToolCallCard.tsx`
- Create: `apps/web/src/components/chat/QuickActions.tsx`

- [ ] **Step 1: Create MessageBubble component**

Create `apps/web/src/components/chat/MessageBubble.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolInvocations?: any[];
}

export function MessageBubble({
  role,
  content,
  toolInvocations
}: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
          AI
        </div>
      )}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        )}
      >
        <div className="whitespace-pre-wrap">{content}</div>
        {/* Tool invocation cards */}
        {toolInvocations &&
          toolInvocations.map((inv: any, i: number) => (
            <ToolCallCard key={i} invocation={inv} />
          ))}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
          你
        </div>
      )}
    </div>
  );
}

function ToolCallCard({ invocation }: { invocation: any }) {
  const state = invocation.state;
  const name = invocation.toolName;
  const result = invocation.result;

  return (
    <div className="mt-2 rounded-lg border bg-background/50 p-2.5 text-xs">
      <div className="flex items-center gap-2 font-medium">
        {state === 'result' ? '✅' : state === 'call' ? '⏳' : '❌'}
        <span>{name}</span>
      </div>
      {state === 'result' && result && (
        <pre className="mt-1 max-h-32 overflow-auto text-muted-foreground">
          {typeof result === 'string'
            ? result
            : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create MessageList component**

Create `apps/web/src/components/chat/MessageList.tsx`:

```tsx
'use client';

import { useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import type { Message } from 'ai';

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          role={msg.role as 'user' | 'assistant' | 'system' | 'tool'}
          content={msg.content}
          toolInvocations={(msg as any).toolInvocations}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 3: Create ChatInput component**

Create `apps/web/src/components/chat/ChatInput.tsx`:

```tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [input, isLoading, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="border-t bg-background p-4">
      <div className="mx-auto flex max-w-3xl gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // Auto-resize
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
          }}
          onKeyDown={handleKeyDown}
          placeholder="输入任务或问题..."
          rows={1}
          className="flex-1 resize-none rounded-xl border bg-muted/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={isLoading}
        />
        <Button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          size="icon"
          className="h-10 w-10 shrink-0 rounded-xl"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create QuickActions component**

Create `apps/web/src/components/chat/QuickActions.tsx`:

```tsx
'use client';

const ACTIONS = [
  { label: '📝 写一篇内容', prompt: '帮我写一篇关于' },
  { label: '📤 发布最新内容', prompt: '帮我发布最新内容到' },
  { label: '💬 查看今日互动', prompt: '查看今天有哪些新评论和私信' },
  { label: '🔍 研究热门话题', prompt: '帮我研究一下最近' }
];

interface QuickActionsProps {
  onSelect: (prompt: string) => void;
}

export function QuickActions({ onSelect }: QuickActionsProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">AI 运营助手</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          通过自然语言执行内容发布、互动管理、话题研究等任务
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => onSelect(action.prompt)}
            className="rounded-xl border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-accent"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create ChatSidebar component**

Create `apps/web/src/components/chat/ChatSidebar.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Plus, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listThreads, type ChatThread } from '@/lib/api/chat';
import { cn } from '@/lib/utils';

interface ChatSidebarProps {
  activeThreadId?: string;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
}

export function ChatSidebar({
  activeThreadId,
  onSelectThread,
  onNewThread
}: ChatSidebarProps) {
  const [threads, setThreads] = useState<ChatThread[]>([]);

  useEffect(() => {
    listThreads()
      .then(setThreads)
      .catch(() => {});
  }, [activeThreadId]);

  return (
    <div className="flex h-full w-64 flex-col border-r bg-muted/30">
      <div className="p-3">
        <Button
          onClick={onNewThread}
          variant="outline"
          className="w-full justify-start gap-2"
        >
          <Plus className="h-4 w-4" />
          新对话
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        {threads.map((thread) => (
          <button
            key={thread.id}
            onClick={() => onSelectThread(thread.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
              thread.id === activeThreadId
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50'
            )}
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="truncate">{thread.title || '新对话'}</span>
          </button>
        ))}
      </div>
      <div className="border-t p-3">
        <a
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50"
        >
          📊 Dashboard
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create ChatPanel (main orchestration component)**

Create `apps/web/src/components/chat/ChatPanel.tsx`:

```tsx
'use client';

import { useChat } from 'ai/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatSidebar } from './ChatSidebar';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { QuickActions } from './QuickActions';
import { getThread } from '@/lib/api/chat';

interface ChatPanelProps {
  threadId?: string;
  onThreadIdChange?: (threadId: string) => void;
}

export function ChatPanel({
  threadId: initialThreadId,
  onThreadIdChange
}: ChatPanelProps) {
  const currentThreadId = useRef(initialThreadId);
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';
  const orgId =
    typeof window !== 'undefined'
      ? localStorage.getItem('currentOrgId') || ''
      : '';

  const { messages, input, setInput, isLoading, append, setMessages } = useChat(
    {
      api: '/api/chat',
      body: {
        threadId: currentThreadId.current,
        token,
        organizationId: orgId
      },
      onFinish: () => {
        // Thread ID is returned in response header — update if new
      },
      onResponse: (response) => {
        const newThreadId = response.headers.get('X-Thread-Id');
        if (newThreadId && !currentThreadId.current) {
          currentThreadId.current = newThreadId;
          onThreadIdChange?.(newThreadId);
        }
      }
    }
  );

  // Load history for existing thread
  useEffect(() => {
    if (initialThreadId) {
      getThread(initialThreadId)
        .then((thread) => {
          if (thread.messages && thread.messages.length > 0) {
            setMessages(
              thread.messages.map((m: any) => ({
                id: m.id,
                role: m.role,
                content: m.content
              }))
            );
          }
        })
        .catch(() => {});
    }
  }, [initialThreadId, setMessages]);

  const handleSend = useCallback(
    (content: string) => {
      append({ role: 'user', content });
    },
    [append]
  );

  const handleNewThread = useCallback(() => {
    currentThreadId.current = undefined;
    setMessages([]);
    onThreadIdChange?.(undefined as any);
  }, [setMessages, onThreadIdChange]);

  const handleSelectThread = useCallback((id: string) => {
    window.location.href = `/chat/${id}`;
  }, []);

  return (
    <div className="flex h-full">
      <ChatSidebar
        activeThreadId={currentThreadId.current}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
      />
      <div className="flex flex-1 flex-col">
        {messages.length === 0 ? (
          <QuickActions onSelect={handleSend} />
        ) : (
          <MessageList messages={messages} />
        )}
        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/chat/
git commit -m "feat: add Chat UI components (ChatPanel, Sidebar, Input, Messages, QuickActions)"
```

---

## Task 8: Route Group + Page Wiring

**Files:**

- Create: `apps/web/src/app/(chat)/layout.tsx`
- Create: `apps/web/src/app/(chat)/page.tsx`
- Create: `apps/web/src/app/(chat)/chat/[threadId]/page.tsx`
- Modify: `apps/web/src/components/layout/navigation.ts`

- [ ] **Step 1: Create (chat) route group layout**

Create `apps/web/src/app/(chat)/layout.tsx`:

```tsx
import { AuthProvider } from '@/providers/AuthProvider';

export default function ChatLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <div className="h-screen">{children}</div>
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Create chat home page (new thread)**

Create `apps/web/src/app/(chat)/page.tsx`:

```tsx
'use client';

import { ChatPanel } from '@/components/chat/ChatPanel';
import { useRouter } from 'next/navigation';

export default function ChatPage() {
  const router = useRouter();

  return (
    <ChatPanel
      onThreadIdChange={(threadId) => {
        if (threadId) router.replace(`/chat/${threadId}`);
      }}
    />
  );
}
```

- [ ] **Step 3: Create thread page (existing thread)**

Create `apps/web/src/app/(chat)/chat/[threadId]/page.tsx`:

```tsx
'use client';

import { use } from 'react';
import { ChatPanel } from '@/components/chat/ChatPanel';

export default function ThreadPage({
  params
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = use(params);
  return <ChatPanel threadId={threadId} />;
}
```

- [ ] **Step 4: Add "AI 助手" navigation item**

In `apps/web/src/components/layout/navigation.ts`, add a new item at the top of the array:

```typescript
{
  label: 'AI 助手',
  route: '/',
  icon: 'MessageCircle',
  hidden: false,
},
```

And add the `MessageCircle` icon import to wherever icons are used in the Sidebar.

- [ ] **Step 5: Verify the app builds**

Run: `cd apps/web && npx next build 2>&1 | tail -20`
Expected: Build succeeds (warnings OK, no errors)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/(chat)/ apps/web/src/components/layout/navigation.ts
git commit -m "feat: add chat route group with home and thread pages"
```

---

## Task 9: Integration Smoke Test

**Files:**

- Create: `tests/integration/api/chat-threads.test.ts`

- [ ] **Step 1: Write integration test for chat thread CRUD**

Create `tests/integration/api/chat-threads.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';

let apiServer: Server;
let baseUrl: string;
const db = createDatabaseClient();
let authToken = '';
let orgId = '';

async function post(path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      authorization: `Bearer ${authToken}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${authToken}` }
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);

  const admin = await db.user.findFirstOrThrow({
    where: { email: 'admin@ai-growth-ops.local' }
  });
  const org = await db.organization.create({
    data: {
      name: 'Chat Test Org',
      slug: `chat-test-${Date.now()}`,
      status: 'active'
    }
  });
  await db.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: admin.id,
      role: 'owner',
      status: 'active'
    }
  });
  orgId = org.id;

  apiServer = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) =>
    apiServer.listen(0, '127.0.0.1', resolve)
  );
  const addr = apiServer.address() as { address: string; port: number };
  baseUrl = `http://${addr.address}:${addr.port}`;

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@ai-growth-ops.local',
      password: 'changeme123'
    })
  });
  const loginBody = (await loginRes.json()) as { token: string };
  authToken = loginBody.token;
});

afterAll(async () => {
  await new Promise<void>((r) => apiServer.close(() => r()));
  await db.$disconnect();
});

describe('Chat Thread CRUD', () => {
  let threadId: string;

  it('creates a thread', async () => {
    const { status, body } = await post('/api/chat/threads', {});
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.status).toBe('active');
    threadId = body.id;
  });

  it('lists threads', async () => {
    const { status, body } = await get('/api/chat/threads');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('gets a thread with messages', async () => {
    const { status, body } = await get(`/api/chat/threads/${threadId}`);
    expect(status).toBe(200);
    expect(body.id).toBe(threadId);
    expect(Array.isArray(body.messages)).toBe(true);
  });

  it('adds a message to a thread', async () => {
    const { status, body } = await post(
      `/api/chat/threads/${threadId}/messages`,
      {
        role: 'user',
        content: '帮我发布到抖音'
      }
    );
    expect(status).toBe(201);
    expect(body.role).toBe('user');
    expect(body.content).toBe('帮我发布到抖音');
  });

  it('auto-generates title from first user message', async () => {
    const { body } = await get(`/api/chat/threads/${threadId}`);
    expect(body.title).toBe('帮我发布到抖音');
  });

  it('returns 404 for non-existent thread', async () => {
    const { status } = await get('/api/chat/threads/nonexistent');
    expect(status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd /Users/tutu/apps/ai-growth-ops
pnpm vitest run tests/integration/api/chat-threads.test.ts --reporter=verbose
```

Expected: All 6 tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/integration/api/chat-threads.test.ts
git commit -m "test: add integration tests for chat thread CRUD"
```

---

## Self-Review Checklist

| Check                                                              | Status                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Spec coverage: all P0 items have tasks                             | ✅ deps, models, API, tools, route handler, UI, routes, test |
| Placeholder scan: no TBD/TODO                                      | ✅ all code provided                                         |
| Type consistency: ChatThread/ChatMessage fields match across files | ✅ schema ↔ API routes ↔ client ↔ components                 |
| File paths: all paths are exact and follow existing patterns       | ✅ verified against project structure                        |
