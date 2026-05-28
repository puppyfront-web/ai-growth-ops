# 05. SDD：AI 代码生成指南 v9

## 1. SDD 目标

本文件用于指导 Codex / Claude Code / Cursor 按结构化软件设计生成代码。目标是让 AI 先理解架构边界，再分阶段生成可测试、可运行、可维护的系统。

本项目必须采用：

```text
SDD 指导设计
TDD 驱动实现
Mock Provider 保障验收
Real Provider 渐进接入
```

---

## 2. 生成代码的总体原则

1. 不要一次性生成全部代码。
2. 每个阶段先生成测试，再生成实现。
3. 所有外部平台调用必须通过 Provider Gateway。
4. 所有 AI 输出必须通过 Schema 校验。
5. 所有任务必须有状态机。
6. 所有失败必须可重试、可追踪、可人工处理。
7. 所有核心数据必须保存到 PostgreSQL。
8. 飞书/企微是同步目标，不是主数据库。
9. MediaCrawler 不得直接访问主业务库。
10. Browser Assist 不得绕过验证码或平台风控。

## 2.1 当前 MVP 硬性排除项与未来预留

AI 代码生成时禁止实现以下真实生产模块，但允许实现接口、类型、Mock Provider、Disabled Provider 和状态机扩展点：

- AI 生图服务、图片生成 API、图片生成队列。
- AI 生视频服务、视频生成 API、视频生成队列。
- 自动剪辑、混剪、字幕生成、配音、数字人。
- 与 Stable Diffusion、Midjourney、DALL·E、Runway、Pika、可灵、Sora 等多媒体生成工具直接相关的集成。

当前允许实现：素材上传、素材库管理、素材元数据、对象存储、发布前校验、图文/视频发布任务、未来媒体生成接口定义、MockMediaGenerationProvider、DisabledMediaGenerationProvider、素材审核状态机。

---

## 3. 推荐项目结构

```text
ai-growth-ops/
├── apps/
│   ├── web/
│   ├── api/
│   ├── worker/
│   ├── provider-gateway/
│   ├── browser-runner/
│   ├── research-runner/
│   └── admin-cli/
├── packages/
│   ├── shared/
│   ├── database/
│   ├── connectors/
│   ├── providers/
│   ├── skills/
│   ├── ai/
│   ├── lead-sinks/
│   └── observability/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json
```

---

## 4. 必须先生成的共享类型

### 4.1 Platform

```ts
export type Platform =
  | 'douyin'
  | 'xiaohongshu'
  | 'wechat_official'
  | 'wechat_channels'
  | 'baijiahao'
  | 'zhihu';

export type ProviderMode =
  | 'official_api'
  | 'browser_assist'
  | 'manual_confirm'
  | 'manual_import'
  | 'mock';
```

### 4.2 Content

```ts
export type ContentType = 'text_image' | 'video' | 'article' | 'answer';
export type ContentStatus = 'draft' | 'ready' | 'archived';
```

### 4.3 Publish

```ts
export type PublishJobStatus =
  | 'DRAFT'
  | 'READY'
  | 'SCHEDULED'
  | 'RUNNING'
  | 'WAITING_HUMAN_CONFIRM'
  | 'PUBLISHED'
  | 'FAILED'
  | 'NEED_MANUAL_REPAIR'
  | 'CANCELLED';
```

### 4.4 Lead

```ts
export type LeadLevel = 'A' | 'B' | 'C' | 'D';
export type LeadStatus =
  | 'NEW'
  | 'QUALIFIED'
  | 'SYNCING'
  | 'SYNCED'
  | 'ASSIGNED'
  | 'CONTACTED'
  | 'ADDED_WECOM'
  | 'WON'
  | 'LOST'
  | 'INVALID';
```

---

## 5. Prisma Schema 设计要求

### 5.1 通用字段

所有核心表必须包含：

```text
id
userId
createdAt
updatedAt
deletedAt optional
metadata Json optional
```

### 5.2 PlatformAccount

字段：

```text
id
userId
platform
name
mode
status
authType
accessTokenEncrypted
refreshTokenEncrypted
cookieRef
capabilities Json
lastHealthCheckAt
expiresAt
metadata
```

### 5.3 ContentItem

字段：

```text
id
userId
projectId
type
title
body
status
sourceType
sourceResearchTaskId
metadata
```

### 5.4 ContentVariant

字段：

```text
id
userId
contentItemId
platform
contentType
title
body
tags Json
cta
mediaAssetIds Json
complianceStatus
metadata
```

### 5.5 PublishJob

字段：

```text
id
userId
contentVariantId
platformAccountId
platform
contentType
mode
status
scheduledAt
startedAt
finishedAt
externalPostId
externalUrl
lastError
retryCount
metadata
```

### 5.6 Interaction

字段：

```text
id
userId
platform
platformAccountId
publishJobId optional
externalInteractionId
externalUserId
externalUserName
type
content
rawPayload Json
status
receivedAt
metadata
```

### 5.7 Lead

字段：

```text
id
userId
sourcePlatform
sourceAccountId
sourceInteractionId
sourcePublishJobId
externalUserId
externalUserName
level
status
intent
confidence
summary
tags Json
assignedTo
nextAction
riskLevel
metadata
```

### 5.8 ResearchTask

字段：

```text
id
userId
type
platforms Json
keywords Json
targetAccounts Json
status
provider
rateLimitPolicy Json
startedAt
finishedAt
lastError
metadata
```

---

## 6. API 生成规范

### 6.1 Controller 风格

每个模块使用：

```text
*.module.ts
*.controller.ts
*.service.ts
*.repository.ts
*.dto.ts
*.schema.ts
*.spec.ts
```

### 6.2 响应结构

所有 API 返回：

```ts
export type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  traceId: string;
};
```

### 6.3 错误码

必须定义统一错误码：

```text
VALIDATION_ERROR
NOT_FOUND
UNAUTHORIZED
FORBIDDEN
PROVIDER_FAILED
PUBLISH_FAILED
AI_OUTPUT_INVALID
RATE_LIMITED
SYNC_FAILED
STATE_TRANSITION_INVALID
```

---

## 7. 状态机实现要求

### 7.1 PublishJob 状态机

必须实现纯函数：

```ts
export function canTransitionPublishJob(
  from: PublishJobStatus,
  to: PublishJobStatus
): boolean;
export function transitionPublishJob(
  job: PublishJob,
  to: PublishJobStatus
): PublishJob;
```

测试必须覆盖：

- 合法转换。
- 非法转换。
- 终态不可再变更。

### 7.2 Lead 状态机

同上。

---

## 8. Provider Gateway 代码生成要求

### 8.1 Provider 接口

```ts
export interface PublishProvider {
  name: string;
  version: string;
  getCapabilities(account: PlatformAccountDTO): Promise<PlatformCapabilities>;
  publishTextImage(input: PublishTextImageInput): Promise<PublishResult>;
  publishVideo(input: PublishVideoInput): Promise<PublishResult>;
}

export interface ResearchProvider {
  name: string;
  searchPosts(input: SearchPostsInput): Promise<CollectedPostDTO[]>;
  collectComments(input: CollectCommentsInput): Promise<CollectedCommentDTO[]>;
}

export interface LeadSinkProvider {
  name: string;
  syncLead(input: SyncLeadInput): Promise<SyncLeadResult>;
  notify(input: NotifyLeadInput): Promise<NotifyLeadResult>;
}
```

### 8.2 Mock Provider 必须先实现

生成：

- MockPublishProvider。
- MockResearchProvider。
- MockFeishuProvider。
- MockWeComProvider。
- MockAIProvider。

Real Provider 后续接入，不影响主流程。

---

## 9. AI Skill 生成要求

### 9.1 Skill 文件结构

```text
packages/skills/<skill-name>/
├── SKILL.md
├── prompt.md
├── schema.ts
├── examples/
└── tests/
```

### 9.2 每个 Skill 必须有

1. 输入 Schema。
2. 输出 Schema。
3. Prompt。
4. Mock fixture。
5. 单元测试。
6. 失败处理。

### 9.3 必须先生成的 Skill

1. topic-generation。
2. platform-rewrite。
3. compliance-check。
4. lead-classification。
5. reply-suggestion。
6. public-comment-insight。
7. growth-review。

---

## 10. 队列任务生成要求

### 10.1 Job Handler 结构

```ts
export interface JobHandler<TInput> {
  name: string;
  handle(input: TInput, context: JobContext): Promise<void>;
}
```

### 10.2 必须生成的任务

```text
GenerateContentJob
RewriteContentJob
ComplianceCheckJob
ExecutePublishJob
SyncInteractionsJob
ClassifyLeadJob
SuggestReplyJob
SyncLeadToFeishuJob
SyncLeadToWeComJob
RunResearchTaskJob
AnalyzeResearchTaskJob
AggregateAnalyticsJob
```

---

## 11. 前端生成规范

### 11.1 页面优先级

先生成：

1. Dashboard。
2. Accounts。
3. Content Projects。
4. Content Items。
5. Publish Jobs。
6. Conversations。
7. Leads。
8. Research。
9. Analytics。
10. Settings。

### 11.2 前端组件

```text
PlatformBadge
StatusBadge
CapabilityMatrix
PublishJobTimeline
LeadLevelBadge
ConversationPanel
AISuggestionCard
ResearchInsightCard
ProviderRunLogTable
```

---

## 12. 不允许 AI 生成的内容

1. 不允许写死真实平台账号、Token、Cookie。
2. 不允许绕过验证码。
3. 不允许生成批量骚扰私信逻辑。
4. 不允许把 MediaCrawler 用于私信采集。
5. 不允许把飞书/企微当唯一主库。
6. 不允许忽略错误处理。
7. 不允许没有测试就实现功能。

---

## 13. AI 生成代码执行顺序

### Step 1：项目初始化

生成 monorepo、package、tsconfig、lint、test、docker-compose。

### Step 2：数据库

生成 Prisma schema、migration、seed、repository 测试。

### Step 3：共享类型

生成 Platform、Content、Publish、Lead、Research、Provider 类型。

### Step 4：Mock Provider

生成 Mock Provider 和测试。

### Step 5：Content + Publish

生成 API、状态机、队列、前端页面。

### Step 6：AI Skill Runner

生成 AI Provider、Skill Runner、Skill 测试。

### Step 7：Interaction + Lead

生成评论私信入库、线索评分、回复建议、线索池。

### Step 8：飞书/企微

生成 Lead Sink Provider、配置页、同步队列。

### Step 9：Research Ops

生成 ResearchTask、MockResearch、MediaCrawler Adapter 外壳。

### Step 10：Analytics

生成数据复盘 API 和页面。

### Step 11：E2E

生成完整 Mock E2E。

---

## 14. 完成定义

AI 生成的代码必须满足：

```bash
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
docker compose up
```

全部通过。

## 15. 模块级目录结构与接口约束（specs_v1 补充）

### 15.1 Worker 队列 (apps/worker)

```text
apps/worker/src/
├── index.ts              # 启动入口
├── queue.ts              # BullMQ 队列工厂
├── worker.ts             # Worker 注册与事件处理
├── retry-policy.ts       # 统一重试策略
├── job-types.ts          # 所有作业类型定义
└── job-handlers/
    ├── publish.execute.ts
    ├── publish.browser-assist.ts
    ├── research.run.ts
    ├── research.collect-posts.ts
    ├── research.generate-insights.ts
    ├── lead.sync.feishu-bitable.ts
    ├── lead.sync.wecom-contact.ts
    ├── content.generate.ts
    ├── content.rewrite.ts
    ├── analytics.aggregate.ts
    └── ... (其他 job handler)
```

接口约束：
- 所有 job handler 必须实现 `JobHandler<TInput>` 接口
- 所有 job 必须创建/更新 SystemTask 记录
- 重试策略：指数退避, maxRetries=3
- 失败必须写 ProviderRunLog

### 15.2 AI Skill Engine (packages/ai)

```text
packages/ai/src/
├── llm-client.ts       # LLM 调用封装
├── prompt-loader.ts    # SKILL.md prompt 加载
├── schema-validator.ts # JSON Schema 校验
├── token-tracker.ts    # Token 用量记录
└── index.ts
```

接口约束：
- LLM 调用必须支持 Mock/Real Provider 切换
- 所有 AI 输出必须通过 Schema 校验
- 不允许无结构化输出
- Token 用量必须记录到 SkillRun

### 15.3 Skills (packages/skills)

```text
packages/skills/src/
├── runner.ts       # SkillRunner 接口实现
├── registry.ts     # Skill 注册表
└── definitions/
    ├── content-writing/
    │   ├── SKILL.md
    │   ├── schema/input.schema.json
    │   ├── schema/output.schema.json
    │   ├── examples/
    │   └── tests/
    ├── platform-rewrite/
    ├── compliance-check/
    ├── lead-classification/
    ├── reply-suggestion/
    ├── research-insight/
    └── growth-review/
```

接口约束 (specs_v1 05 §4)：
```ts
export interface SkillRunner {
  run<TInput, TOutput>(input: {
    skillName: string;
    skillVersion?: string;
    input: TInput;
    context?: SkillContext;
  }): Promise<SkillRunResult<TOutput>>;
}
```

每个 Skill 必须有：input schema, output schema, prompt, mock fixture, 单元测试
- lead-classification 输出必须包含 leadLevel/confidence/riskLevel
- reply-suggestion 输出必须包含 suggestedText/needReview

### 15.4 发布 Provider (packages/providers/src/publish/)

```text
packages/providers/src/publish/
├── publish-provider.ts        # PublishProvider 接口
├── capabilities.ts            # 平台能力矩阵
├── sandbox-provider.ts        # 沙箱 Provider
├── disabled-provider.ts       # 禁用 Provider
├── browser-assist-provider.ts # 浏览器辅助
└── manual-confirm-provider.ts # 人工确认
```

接口约束 (specs_v1 01 §6)：
```ts
export interface PublishProvider {
  getCapabilities(): Promise<PublishCapabilities>;
  publishTextImage(input: PublishTextImageInput): Promise<PublishResult>;
  publishVideo(input: PublishVideoInput): Promise<PublishResult>;
  publishArticle(input: PublishArticleInput): Promise<PublishResult>;
  fetchPublishStatus(input: FetchPublishStatusInput): Promise<PublishStatusResult>;
}
```

能力声明必须包含：
```ts
export type PublishCapabilities = {
  platform: PlatformCode;
  publishTextImage: boolean | 'limited';
  publishVideo: boolean | 'limited';
  publishArticle: boolean | 'limited';
  supportsSchedule: boolean;
  supportsDraft: boolean;
  requiresHumanConfirm: boolean;
  supportedModes: PublishMode[];
};
```

### 15.5 Lead Sinks (packages/lead-sinks)

```text
packages/lead-sinks/src/
├── types.ts
├── field-mapper.ts
├── idempotent-sync.ts
├── feishu-bitable-sink.ts
├── feishu-bot-sink.ts
├── wecom-contact-sink.ts
├── wecom-message-sink.ts
└── crm-webhook-sink.ts
```

接口约束 (specs_v1 03)：
- 同一个 leadId + sinkType 唯一 LeadExternalMapping
- 已有 externalId 时为 update 而非 create
- 同步失败不能删除本地 Lead
- 所有同步写 LeadSinkSyncLog

### 15.6 Research Runner (apps/research-runner)

```text
apps/research-runner/src/
├── index.ts
├── server.ts
├── routes.ts
└── providers/
    ├── recorded-provider.ts
    ├── manual-import-provider.ts
    └── media-crawler-provider.ts
```

接口约束 (specs_v1 02)：
```ts
export interface ResearchProvider {
  getCapabilities(): Promise<ResearchCapabilities>;
  searchPosts(input: SearchPostsInput): Promise<CollectedPostDTO[]>;
  collectPostComments(input: CollectCommentsInput): Promise<CollectedCommentDTO[]>;
  collectCreatorPosts(input: CollectCreatorInput): Promise<CollectedPostDTO[]>;
}
```

- real_crawler 必须启用 rateLimitPolicy
- 所有任务受 maxPosts/maxComments 限制
- 连续失败超阈值进入 suspended

### 15.7 Provider Gateway (apps/provider-gateway)

```text
apps/provider-gateway/src/
├── index.ts
├── server.ts
├── gateway.ts
├── health-check.ts
└── run-log.ts
```

接口约束 (specs_v1 05 §5)：
```ts
export interface ExternalProvider {
  name: string;
  type: string;
  mode: ProviderMode;
  healthCheck(): Promise<ProviderHealth>;
}
```

- 业务模块不能直接调用开源工具
- 所有调用记录 ProviderRunLog
- Provider 失败不能污染主数据

### 15.8 Interaction Ops (评论私信拉取与回复)

```text
packages/connectors/src/interaction/
├── types.ts                           # InteractionConnector 接口 + InteractionCapabilities
├── base-connector.ts                  # BaseInteractionConnector 抽象类
├── recorded-connector.ts              # 录制回放
├── manual-import-connector.ts         # 手动导入
├── sandbox-connector.ts               # 沙箱
├── disabled-connector.ts              # 禁用
├── douyin-connector.ts                # 抖音 Connector skeleton
├── xiaohongshu-connector.ts           # 小红书 Connector skeleton
├── wechat-official-connector.ts       # 公众号 Connector skeleton
├── wechat-channels-connector.ts       # 视频号 Connector skeleton
├── baijiahao-connector.ts             # 百家号 Connector skeleton
└── zhihu-connector.ts                 # 知乎 Connector skeleton
```

接口约束 (specs_v1 评论私信Spec §6)：
```ts
export interface InteractionConnector {
  getCapabilities(): Promise<InteractionCapabilities>;
  fetchComments(input: FetchCommentsInput): Promise<PlatformComment[]>;
  fetchMessages(input: FetchMessagesInput): Promise<PlatformMessage[]>;
  replyComment(input: ReplyCommentInput): Promise<ReplyResult>;
  replyMessage(input: ReplyMessageInput): Promise<ReplyResult>;
  markHandled(input: MarkHandledInput): Promise<MarkHandledResult>;
}
```

新增数据模型：
- InteractionClassification: intent, leadLevel, confidence, riskLevel, summary, tags, nextAction
- ReplySuggestion: suggestedText, replyType, riskLevel, needReview, decision, status
- ReplyAttempt: platform, providerMode, status, externalReplyId, errorCode
- InteractionSyncJob: syncType, mode, status, cursor, fetchedCount

状态机要求：
- Interaction: new → classified → reply_suggested → waiting_human_review → replied
- ReplySuggestion: draft → waiting_review → approved → sent
- needReview=true 时不能 draft → sent
- riskLevel=high 时必须 waiting_review

队列任务：
- interaction.sync.comments, interaction.sync.messages
- interaction.classify, interaction.suggest_reply, interaction.send_reply

AI Skill 要求：
- lead-classification: 输出必须包含 intent, leadLevel, confidence, riskLevel
- reply-suggestion: 输出必须包含 suggestedText, replyType, riskLevel, needReview
- risk-check: 检测敏感词、导流、夸大承诺、手机号/微信号、平台禁用词

Reply Policy Engine 规则：
- riskLevel=high → require_human_review
- leadLevel=A → require_human_review
- confidence < 0.75 → require_human_review
- 平台不支持回复 → manual_only
- 普通 FAQ + low risk + confidence>=0.85 → auto_send

### 15.9 审计与安全 (packages/observability)

```text
packages/observability/src/
├── audit-logger.ts
├── middleware.ts
├── secret-logger.ts
└── notifier.ts
```

接口约束 (specs_v1 07)：
- 关键动作自动写 AuditLog
- Secret 加密存储，前端永不返回明文
- 日志不得记录明文 Secret

### 15.10 Connectors (packages/connectors)

```text
packages/connectors/src/
├── storage/minio.ts
├── feishu/client.ts
├── wecom/client.ts
├── media-crawler/client.ts
└── social-publish/client.ts
```

- MinIO 用于素材上传/截图/导入导出
- 飞书 SDK 用于多维表格同步和群机器人
- 企微 SDK 用于客户承接和应用消息

### 15.11 代码生成顺序（更新）

基于 specs_v1 的模块依赖关系，推荐生成顺序：

```text
1. packages/database (Prisma schema 变更: Notification, SystemTask, SecretRef, AnalyticsEvent)
2. packages/shared (状态机: ContentItem, ResearchTask)
3. packages/observability (audit-logger, notifier)
4. packages/ai (llm-client, schema-validator, token-tracker)
5. packages/skills (runner, registry, 7 个 Skill 定义)
6. apps/worker (queue, worker, job-handlers)
7. packages/connectors (minio, feishu, wecom)
8. packages/providers/src/publish/ (sandbox, disabled, browser-assist, manual-confirm)
9. packages/lead-sinks (field-mapper, idempotent-sync, 5 个 Sink)
10. apps/research-runner (server, routes, providers)
11. apps/provider-gateway (server, gateway, health-check)
12. apps/api/src/middleware/ (auth, rbac)
13. apps/api/src/routes.ts (增强已有端点)
14. apps/web/src/app/ (50+ 页面)
```

## 16. 未来 Media Generation 代码生成要求

当前阶段只生成预留代码，不生成真实模型调用。

必须生成：

```text
packages/providers/media-generation/
├── types.ts
├── media-generation-provider.interface.ts
├── mock-media-generation.provider.ts
├── disabled-media-generation.provider.ts
└── media-generation.provider.spec.ts
```

禁止生成：

```text
真实 Stable Diffusion / Midjourney / Runway / Pika / 可灵 / Sora API 调用
真实 ComfyUI 工作流执行
真实视频渲染、剪辑、字幕、配音代码
```

接口要求：

```ts
interface MediaGenerationProvider {
  generateImage(input: GenerateImageInput): Promise<GeneratedMediaResult>;
  generateVideo(input: GenerateVideoInput): Promise<GeneratedMediaResult>;
  getJobStatus(jobId: string): Promise<MediaGenerationStatus>;
}
```

业务规则：

1. Mock 生成结果只产生 metadata 和占位文件记录。
2. 所有生成素材默认 `pending_review`。
3. 只有 `approved` 素材可以被发布任务引用。
4. 生成任务必须记录到 `ProviderRunLog`。
5. Media Generation 失败不能影响内容运营、发布、线索、飞书企微主流程。
