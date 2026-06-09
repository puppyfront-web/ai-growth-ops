# AI Agent Intelligence Upgrade

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the AI chat assistant from a passive single-tool caller into a proactive, context-aware operations expert that can autonomously orchestrate multi-step workflows and remember user preferences across conversations.

**Architecture:** Three modules layered on the existing Vercel AI SDK chat infrastructure: (1) a memory system that injects operational context and user preferences into each conversation, (2) multi-step autonomous orchestration tools that let the AI plan and execute complex workflows, and (3) a proactive suggestion engine driven by real-time operational data.

**Tech Stack:** Vercel AI SDK v4 (streamText, tool), Anthropic Claude, Prisma, BullMQ

---

## Current State

- 38 chat tools via Vercel AI SDK `streamText` + `tool()` with `maxSteps: 10`
- Each conversation is stateless — no cross-session memory
- AI only responds to explicit user requests; cannot autonomously chain steps
- No operational data injected into conversation context
- System prompt is static (46 tools listed, fixed rules)

## Module 1: Agent Memory System

### 1.1 User Preferences Store

**Model:** Reuse existing `AppConfig` with key `agent_user_preferences` per organization.

**Schema:**

```json
{
  "preferredPlatforms": ["douyin", "xiaohongshu"],
  "defaultContentType": "text_image",
  "preferredPublishTimes": ["09:00", "19:00"],
  "contentStylePreferences": "casual, emoji-rich, short paragraphs",
  "replyStylePreferences": "friendly, helpful, concise",
  "avoidTopics": [],
  "brandVoice": "年轻、专业、有活力"
}
```

**New API endpoints:**

- `GET /api/settings/agent-preferences` — load preferences
- `PUT /api/settings/agent-preferences` — save preferences

**New chat tools:**

- `remember_preference` — save a user preference (key-value)
- `get_my_preferences` — retrieve stored preferences

### 1.2 Operational Context Injection

**New service:** `apps/web/src/app/api/chat/context-builder.ts`

On each conversation turn, build a dynamic context block containing:

1. **Recent activity** (last 7 days):
   - Content items created/published count
   - Pending publish jobs
   - Unread interactions count
   - Active campaigns status
   - Failed tasks requiring attention

2. **User preferences** from AppConfig

3. **Active workflows** (if any running)

4. **Todo/attention items**:
   - Pending reply reviews
   - Compliance failures
   - Failed publishes
   - Leads requiring follow-up (level A/B with no activity in 48h)

**Implementation:** Fetch from existing API endpoints, summarize into ~500 token context block, prepend to system prompt.

### 1.3 Conversation Summarization

**On thread close/inactivity** (via scheduler or on new thread creation):

- Use AI to generate a 2-3 sentence summary of the conversation
- Store in `ChatThread.metadata.summary`
- When user starts a new thread, inject summaries of last 3 threads into context

**New API endpoint:**

- `GET /api/chat/threads/recent-summaries` — returns last N thread summaries

---

## Module 2: Multi-Step Autonomous Orchestration

### 2.1 Plan Execution Tool

**New chat tool:** `execute_plan`

```typescript
tool({
  description:
    'Execute a multi-step operations plan autonomously. Use this when the user asks for a complete workflow like "help me create and publish content" or "run the full engagement loop".',
  parameters: z.object({
    planName: z.string().describe('Human-readable plan name'),
    steps: z.array(
      z.object({
        toolName: z.string(),
        description: z.string(),
        params: z.record(z.unknown()).optional()
      })
    )
  }),
  execute: async ({ planName, steps }) => {
    // Create an AgentRun record to track progress
    // Execute steps sequentially, collecting results
    // Return structured progress report
  }
});
```

**New model:** `AgentRun` (already exists in schema)

```
AgentRun:
  id, organizationId, userId
  type: "plan_execution"
  status: running | completed | failed | paused
  planName: string
  steps: Json (array of { toolName, params, status, result })
  currentStepIndex: number
  startedAt, finishedAt, errorMessage
```

**Key behaviors:**

- Each step result is stored, available for subsequent steps
- If a step fails, AI can decide to retry, skip, or abort
- Progress is reported back to user as structured tool result
- User can interrupt: "停下来" or "跳过这步"

### 2.2 Step Continuation Tool

**New chat tool:** `check_step_result`

```typescript
tool({
  description:
    'Check the result of a previous step and decide what to do next. Use after each autonomous step to verify before proceeding.',
  parameters: z.object({
    agentRunId: z.string(),
    stepIndex: z.number(),
    decision: z.enum(['continue', 'retry', 'skip', 'abort']),
    reason: z.string().optional()
  }),
  execute: async ({ agentRunId, stepIndex, decision, reason }) => {
    // Load AgentRun, get step result
    // Return step result + available next steps
  }
});
```

### 2.3 Pre-built Plan Templates

**New file:** `apps/web/src/app/api/chat/plan-templates.ts`

```typescript
export const PLAN_TEMPLATES = {
  'content-to-publish': {
    name: '内容创作到发布',
    steps: [
      { toolName: 'write_content', description: '创作内容' },
      { toolName: 'check_compliance', description: '合规检查' },
      { toolName: 'rewrite_for_platform', description: '平台改写' },
      { toolName: 'approve_variant', description: '批准变体' },
      { toolName: 'create_publish_job', description: '创建发布任务' }
    ]
  },
  'engagement-sprint': {
    name: '互动管理全流程',
    steps: [
      { toolName: 'sync_comments', description: '同步评论' },
      { toolName: 'sync_messages', description: '同步私信' },
      { toolName: 'list_interactions', description: '查看互动' },
      { toolName: 'classify_interaction', description: '分类线索' },
      { toolName: 'suggest_reply', description: '生成回复建议' }
    ]
  },
  'full-loop': {
    name: '完整运营闭环',
    steps: [
      { toolName: 'run_research', description: '调研热点' },
      { toolName: 'write_content', description: '创作内容' },
      { toolName: 'check_compliance', description: '合规检查' },
      { toolName: 'rewrite_for_platform', description: '平台改写' },
      { toolName: 'approve_variant', description: '批准变体' },
      { toolName: 'create_publish_job', description: '创建发布任务' }
    ]
  }
};
```

**New chat tool:** `list_plan_templates` — show available plans to user

---

## Module 3: Proactive Operations Suggestions

### 3.1 Suggestions Engine

**New service:** `apps/api/src/services/agent-suggestions.ts`

```typescript
export async function generateProactiveSuggestions(
  db: DatabaseClient,
  orgId: string
): Promise<Suggestion[]>;
```

Logic:

1. Query operational data (last 24h):
   - Unread interactions count
   - Pending reply reviews
   - Failed publishes
   - Active campaigns approaching next run
   - Content items in draft > 3 days
   - Level A/B leads with no activity > 48h
2. Apply priority rules:
   - Failed publishes → HIGH (action needed now)
   - Pending reviews → HIGH (blocking workflow)
   - Unread interactions > 10 → MEDIUM
   - Stale drafts → LOW
   - Campaigns approaching schedule → INFO
3. Generate natural language suggestions (max 5)

**New API endpoint:**

- `GET /api/agent/suggestions` — returns prioritized suggestions

### 3.2 Suggestions Chat Tool

**New chat tool:** `get_proactive_suggestions`

```typescript
tool({
  description:
    'Get proactive operational suggestions based on current data. Call this at the start of conversations or when the user asks "what should I do?"',
  parameters: z.object({}),
  execute: async () => {
    // Call GET /api/agent/suggestions
  }
});
```

### 3.3 Welcome Message Enhancement

**File:** `apps/web/src/components/chat/QuickActions.tsx`

When a new conversation starts, auto-call `get_proactive_suggestions` and display results as a welcome banner above the quick actions grid.

---

## System Prompt Updates

**File:** `apps/web/src/app/api/chat/system-prompt.ts`

Add sections:

1. **Memory & Context** — Explain that preferences and recent activity are available
2. **Autonomous Orchestration** — Rules for when to use `execute_plan` vs single tools
3. **Proactive Behavior** — Rules for when to offer suggestions unprompted
4. **Operational Best Practices** — Common patterns (publish timing, reply etiquette, content strategies)

## Chat Route Updates

**File:** `apps/web/src/app/api/chat/route.ts`

1. Call `contextBuilder` to generate dynamic context block
2. Append to system prompt before sending to LLM
3. On `execute_plan` steps, stream progress updates to client

## New TOOL_LABELS

**File:** `apps/web/src/components/chat/MessageBubble.tsx`

Add entries for new tools:

- `execute_plan` → '执行计划'
- `check_step_result` → '检查步骤结果'
- `list_plan_templates` → '可用计划模板'
- `remember_preference` → '记住偏好'
- `get_my_preferences` → '我的偏好'
- `get_proactive_suggestions` → '运营建议'

---

## File Index

### New files to create:

- `apps/api/src/services/agent-suggestions.ts` — proactive suggestion engine
- `apps/web/src/app/api/chat/context-builder.ts` — operational context injection
- `apps/web/src/app/api/chat/plan-templates.ts` — pre-built plan definitions

### Files to modify:

- `packages/database/prisma/schema.prisma` — no changes needed (AgentRun exists)
- `apps/api/src/routes.ts` — 3 new routes (agent preferences CRUD, suggestions)
- `apps/web/src/app/api/chat/route.ts` — inject dynamic context
- `apps/web/src/app/api/chat/tools/index.ts` — import new tool modules
- `apps/web/src/app/api/chat/system-prompt.ts` — add memory/orchestration/proactive sections
- `apps/web/src/app/api/chat/tools/agent-tools.ts` (NEW) — memory + orchestration + suggestion tools
- `apps/web/src/components/chat/MessageBubble.tsx` — new TOOL_LABELS + result renderers
- `apps/web/src/components/chat/QuickActions.tsx` — welcome suggestions banner
