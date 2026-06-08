# AI Native 对话界面设计文档

**日期**: 2026-06-08
**状态**: Approved
**作者**: Claude + puppy.front

## 1. 目标

将 AI Growth Ops 从传统后台管理面板升级为 **AI Native 对话式交互**。用户通过自然语言对话执行运营工作流（发布内容、管理互动、研究话题、账号管理），Dashboard 作为管理后台保留。

## 2. 产品定位

- **主入口**: 全屏 Chat 对话界面（类似 ChatGPT）
- **辅助入口**: Dashboard 中可展开的 Chat 侧边栏
- **两种模式可切换**: 全屏 Chat ↔ Dashboard + Chat Sidebar
- **对话状态共享**: 同一个 thread 在两种模式下通用

## 3. 架构

### 3.1 整体架构图

```
┌──────────────────────────────────────────────────────┐
│                    用户界面层                          │
│  ┌──────────────────┐    ┌───────────────────────┐   │
│  │ Chat UI (全屏)    │    │ Dashboard UI (现有)    │   │
│  │ - useChat hook    │    │ - 侧边栏可展开 Chat   │   │
│  │ - 消息渲染        │    │                       │   │
│  │ - 工具结果展示    │    │                       │   │
│  └────────┬─────────┘    └───────────┬───────────┘   │
│           │     SSE streaming        │               │
├───────────┼─────────────────────────┼───────────────┤
│           ▼                         ▼               │
│  ┌──────────────────────────────────────────────┐   │
│  │       /api/chat (Next.js Route Handler)       │   │
│  │  - streamText() from Vercel AI SDK            │   │
│  │  - System prompt + tool definitions           │   │
│  │  - 对话持久化 (DB read/write)                 │   │
│  └──────────────────────┬───────────────────────┘   │
│                         │                             │
├─────────────────────────┼───────────────────────────┤
│                         ▼                             │
│  ┌──────────────────────────────────────────────┐   │
│  │         Runtime-Core (已存在)                  │   │
│  │  Workflows: publish / interaction / lead /     │   │
│  │             auth / skill.lifecycle             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐      │   │
│  │  │Browser   │ │BullMQ    │ │Skills    │      │   │
│  │  │Runner    │ │Workers   │ │(AI)      │      │   │
│  │  └──────────┘ └──────────┘ └──────────┘      │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### 3.2 核心数据流

1. 用户输入 → `useChat` hook → SSE 到 `/api/chat`
2. `/api/chat` 用 `streamText()` 调 LLM，传入 tool 定义
3. LLM 返回文本流 + tool calls → SDK 自动执行 tool 函数
4. Tool 函数调用 runtime-core 的已有 workflow（或直接查 DB）
5. 结果回传 LLM → LLM 生成最终回复 → 流式返回前端

### 3.3 技术选型

| 层级 | 技术 | 理由 |
|------|------|------|
| LLM SDK | **Vercel AI SDK** (`ai` package) | Next.js 生态最成熟的 streaming + tool calling 方案 |
| LLM 模型 | Claude Sonnet / GPT-4o | 通过现有 `packages/ai` 的 provider 配置 |
| 业务逻辑 | **Runtime-Core** (已存在) | 已有 5 个 workflow + 7 个 skill，直接复用 |
| 对话 UI | Vercel AI SDK `useChat` + shadcn/ui | 统一组件风格 |
| 消息存储 | PostgreSQL (Prisma) | 新增 `ChatThread` + `ChatMessage` 模型 |

## 4. 数据模型

### 4.1 新增 Prisma 模型

```prisma
/// AI 对话会话
model ChatThread {
  id             String        @id @default(cuid())
  organizationId String
  userId         String
  title          String?       // 自动从首条消息生成
  status         String        @default("active") // active | archived
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  organization   Organization  @relation(fields: [organizationId], references: [id])
  user           User          @relation(fields: [userId], references: [id])
  messages       ChatMessage[]

  @@map("chat_threads")
}

/// 对话消息
model ChatMessage {
  id          String     @id @default(cuid())
  threadId    String
  role        String     // user | assistant | system | tool
  content     String     // 消息正文（Markdown）
  toolCalls   Json?      // assistant 发起的 tool call 数组 [{name, arguments}]
  toolResult  Json?      // tool 执行结果（仅 role=tool）
  tokensUsed  Int?
  createdAt   DateTime   @default(now())

  thread      ChatThread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@map("chat_messages")
}
```

### 4.2 索引

- `ChatThread`: `(organizationId, userId, updatedAt DESC)` — 对话列表排序
- `ChatMessage`: `(threadId, createdAt ASC)` — 消息按时间顺序

## 5. Tool 定义

### 5.1 Tool 清单

每个 tool 是 Vercel AI SDK 标准格式：`description` + `parameters` (Zod) + `execute` 函数。

| Tool | 用户示例 | 执行逻辑 |
|------|---------|---------|
| `list_accounts` | "我连接了哪些账号" | 查 DB `platformAccount` |
| `login_account` | "登录我的抖音账号" | runtime-core `auth` workflow → browser-runner |
| `check_cookie_status` | "哪些账号过期了" | 查 DB + cookie 解密检查 |
| `create_content` | "帮我写一篇防晒种草文" | `content-writing` skill |
| `adapt_content` | "改成小红书风格" | `platform-rewrite` skill |
| `publish_content` | "发布到抖音和小红书" | runtime-core `publish` workflow |
| `sync_comments` | "拉取抖音最新评论" | runtime-core `interaction` workflow → BullMQ |
| `sync_messages` | "查看新私信" | runtime-core `interaction` workflow → BullMQ |
| `reply_comment` | "回复这条评论" | runtime-core `interaction` workflow |
| `list_leads` | "今天有哪些新线索" | 查 DB `lead` |
| `research_topic` | "研究美妆行业热点" | BullMQ `research.run` queue |
| `generate_insight` | "分析一下我的数据" | `growth-review` skill |
| `sync_to_feishu` | "把线索同步到飞书" | runtime-core `lead` workflow |

### 5.2 Tool 实现模式

```typescript
// 每个 tool 的标准实现模式
const publishContent = tool({
  description: '将内容发布到指定平台',
  parameters: z.object({
    contentId: z.string().describe('要发布的内容 ID'),
    platforms: z.array(z.string()).describe('目标平台列表'),
    scheduledAt: z.string().optional().describe('定时发布时间 (ISO)'),
  }),
  execute: async ({ contentId, platforms, scheduledAt }, { userId, organizationId }) => {
    // 调用 runtime-core 的 publish workflow
    const result = await runPublishWorkflow({
      organizationId,
      userId,
      contentId,
      platforms,
      scheduledAt,
    });
    return result;
  },
});
```

## 6. API 层

### 6.1 `/api/chat` Route Handler

**位置**: `apps/web/src/app/api/chat/route.ts`

**核心逻辑**:

```typescript
export async function POST(req: Request) {
  const { user, organization } = await getAuthContext(req);
  const { messages, threadId } = await req.json();
  const history = threadId ? await loadThreadMessages(threadId) : [];
  
  const systemPrompt = buildSystemPrompt({
    userName: user.name,
    orgName: organization.name,
    platforms: await getConnectedPlatforms(organization.id),
  });

  const result = streamText({
    model: anthropic('claude-sonnet-4-6-20250514'),
    system: systemPrompt,
    messages: [...history, ...messages],
    tools: allTools,
    maxSteps: 5,
    onFinish: async ({ response }) => {
      await saveMessages(threadId, messages, response);
    },
  });

  return result.toDataStreamResponse();
}
```

### 6.2 System Prompt

```
你是 AI Growth Ops 的智能运营助手。你可以帮助用户：

1. 内容创作：写文章、改写适配不同平台风格
2. 内容发布：发布内容到抖音、小红书等平台
3. 互动管理：拉取评论/私信、回复评论
4. 线索管理：查看线索、同步到飞书/企业微信
5. 话题研究：研究行业热点、分析数据
6. 账号管理：登录账号、检查连接状态

当前上下文：
- 用户：{userName}
- 组织：{orgName}
- 已连接平台：{platforms}
- 今天：{date}

规则：
- 使用中文回复
- 执行操作前确认关键信息（如发布目标平台）
- 缺少必要信息时主动引导用户
- Tool 调用失败时给出清晰错误说明和解决建议
```

## 7. UI 组件

### 7.1 文件结构

```
apps/web/src/
├── app/
│   ├── (chat)/                          # 新增 route group
│   │   ├── layout.tsx                   # Chat 布局
│   │   ├── page.tsx                     # / → 全屏 Chat（默认首页）
│   │   └── chat/[threadId]/page.tsx     # 某个对话
│   └── (dashboard)/                     # 现有，保留
├── components/chat/                     # 新增
│   ├── ChatPanel.tsx                    # 对话主面板
│   ├── ChatSidebar.tsx                  # 左侧对话历史
│   ├── ChatInput.tsx                    # 输入框
│   ├── MessageList.tsx                  # 消息流
│   ├── MessageBubble.tsx                # 单条消息 (Markdown)
│   ├── ToolCallCard.tsx                 # Tool 结果卡片
│   ├── QuickActions.tsx                 # 快捷操作按钮
│   └── ChatSidebarSheet.tsx             # Dashboard 模式侧边栏
```

### 7.2 模式切换

| 模式 | 入口 | 布局 |
|------|------|------|
| 全屏 Chat | `/` (默认首页) | 左侧对话列表 + 右侧聊天窗口 |
| Dashboard + Chat | `/dashboard` 等 | 顶栏 `[💬]` 按钮展开 Chat Sheet |

两种模式共享对话数据（同一组 `ChatThread`/`ChatMessage`）。

### 7.3 Tool 结果展示

Tool 调用结果渲染为结构化卡片，而非纯文本：

- **发布结果**: 平台名 + 状态（成功/失败）+ 链接
- **账号列表**: 平台图标 + 名称 + 连接状态
- **评论列表**: 评论摘要 + 点赞数 + 时间
- **线索列表**: 等级徽章 + 意图 + 来源

### 7.4 快捷操作

空对话时显示 Quick Actions 按钮：

- "帮我写一篇..."
- "发布最新内容"
- "查看今日互动"
- "研究热门话题"

## 8. 状态管理

| 状态 | 存储 | 说明 |
|------|------|------|
| 对话列表 | DB `ChatThread` + React Query | 刷新后保留 |
| 消息历史 | DB `ChatMessage` + `useChat` | 刷新后从 DB 恢复 |
| 流式消息 | `useChat` 内部状态 | 实时，不持久化直到 `onFinish` |
| Tool 执行状态 | `useChat.toolInvocations` | UI 展示 loading/完成 |
| 模式切换 | URL 路由 | `/` = 全屏，其他 + Sheet = 侧栏 |

## 9. 路由设计

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | Chat 全屏 | 默认首页，显示最新对话或新对话 |
| `/chat/[threadId]` | 某个对话 | 加载指定对话历史 |
| `/dashboard` | Dashboard | 现有，不变 |
| `/content/*` | 内容管理 | 现有，不变 |
| `/publish/*` | 发布管理 | 现有，不变 |
| `/api/chat` | API | SSE streaming endpoint |

## 10. 实现优先级

### P0 — 核心对话（第一版）

1. 安装 Vercel AI SDK 依赖
2. 新增 `ChatThread` / `ChatMessage` 数据模型 + migration
3. 实现 `/api/chat` Route Handler（streaming + tools）
4. 实现 Chat UI 全屏模式（ChatPanel + ChatSidebar + ChatInput）
5. 实现 3-5 个核心 tools: `list_accounts`, `publish_content`, `sync_comments`, `create_content`, `check_cookie_status`

### P1 — 完善体验

6. Dashboard 模式下的 Chat Sidebar (Sheet)
7. 更多 tools: `login_account`, `reply_comment`, `research_topic`, etc.
8. Tool 结果结构化卡片渲染
9. 对话标题自动生成
10. Quick Actions 空状态引导

### P2 — 高级功能

11. 对话中上传文件（图片/文档）
12. 对话中引用 Dashboard 中的具体内容
13. 多轮对话上下文优化（长对话摘要）
14. Tool 调用链路追踪和错误恢复
15. 对话分享/导出

## 11. 依赖安装

```bash
pnpm add ai @ai-sdk/anthropic @ai-sdk/openai
# ai           — Vercel AI SDK 核心
# @ai-sdk/anthropic — Anthropic provider
# @ai-sdk/openai    — OpenAI provider
```

## 12. 风险和缓解

| 风险 | 缓解 |
|------|------|
| LLM tool calling 不稳定 | 设置 `maxSteps` 限制重试；tool 失败时返回结构化错误 |
| Streaming 长时间连接断开 | `useChat` 自动重连 + 消息持久化 |
| Tool 调用耗时过长 | 异步 tool 模式：立即返回 "正在处理..."，通过 polling/webhook 更新 |
| 对话上下文过长 | 超过 token 限制前自动摘要历史消息 |
| 多租户安全 | 每个 tool execute 都带 organizationId 校验 |
