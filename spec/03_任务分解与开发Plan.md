# 03. 任务分解与开发 Plan v9

> 基于 specs_v1 补充 Spec 全面升级。将原有 M0-M8 里程碑调整为 Phase 0-5 六阶段开发计划，确保先跑通主闭环，同时所有模块可并行推进。

## 1. 开发原则

1. 先跑通主流程，再增强单模块深度。
2. 先基础设施，再业务功能。
3. 先 TDD 测试，再实现代码。
4. 先 Mock Provider，再 Real Provider。
5. 先本地闭环，再外部平台。
6. 每个阶段都必须可运行、可演示、可回归测试。
7. 不使用前端 Mock 数据，前端按钮必须调用真实 API。
8. API 必须写入真实数据库。
9. 外部平台不可控时，使用 sandbox / recorded / manual / browser_assist / disabled Provider。
10. 所有 Provider 必须有 Contract Test。
11. 所有状态机必须有单元测试。
12. 所有异步任务必须有任务日志和重试策略。
13. 所有关键动作必须有 AuditLog。
14. 所有高风险动作必须人工确认。

---

## 2. 总体阶段

| 阶段 | 名称 | 目标 | 预计周期 |
|------|------|------|----------|
| Phase 0 | 基础设施 | Worker 队列、Auth/RBAC、审计日志、通知、任务中心 | Week 1-2 |
| Phase 1 | 主内容流程闭环 | 选题→内容→发布→互动→线索→复盘 核心链路 | Week 3-4 |
| Phase 2 | 调研与外部集成 | Research Runner、Lead Sinks、Provider Gateway | Week 5-6 |
| Phase 3 | 前端全面实现 | 50+ 页面从 stub 到可交互 | Week 5-8 (并行) |
| Phase 4 | 安全与数据管理 | RBAC 完善、Secret 安全、导入导出、备份 | Week 7-8 |
| Phase 5 | 测试完善 | 状态机测试、Provider Contract Tests、集成/E2E | Week 7-8 |

---

## 3. Phase 0：基础设施

### 3.1 Worker 队列基础设施

**文件**: `apps/worker/src/`

**当前状态**: 仅脚手架（健康检查）

**需实现**:

```text
apps/worker/src/
├── index.ts              # 启动入口，注册所有 Worker
├── queue.ts              # BullMQ 队列工厂
├── worker.ts             # Worker 注册与事件处理
├── retry-policy.ts       # 统一重试策略（指数退避, maxRetries=3）
├── job-types.ts          # 所有作业类型定义
└── job-handlers/
    ├── publish.execute.ts
    ├── publish.browser-assist.ts
    ├── publish.status-fetch.ts
    ├── research.run.ts
    ├── research.collect-posts.ts
    ├── research.collect-comments.ts
    ├── research.generate-insights.ts
    ├── research.generate-opportunities.ts
    ├── lead.sync.feishu-bitable.ts
    ├── lead.notify.feishu-bot.ts
    ├── lead.sync.wecom-contact.ts
    ├── lead.notify.wecom-app-message.ts
    ├── lead.sync.crm-webhook.ts
    ├── content.generate.ts
    ├── content.rewrite.ts
    ├── content.compliance-check.ts
    ├── analytics.aggregate.ts
    └── analytics.report.ts
```

**技术**: BullMQ + Redis (docker-compose 已有 Redis 7)

**验收**:
- Worker 可消费 Redis 队列
- Job 成功/失败都有 SystemTask 记录
- 重试策略生效

### 3.2 Auth 中间件 & RBAC

**文件**: `apps/api/src/middleware/`

**当前状态**: 使用 `getDemoUser()` 硬编码

**需实现**:

```text
apps/api/src/middleware/
├── auth.ts          # JWT/Session 认证中间件
├── rbac.ts          # 角色权限检查
└── permissions.ts   # 权限点定义
```

**角色**: Admin / Operator / Sales / Viewer

**权限点** (来自 specs_v1 07):

```text
content.create, content.approve
publish.execute, publish.cancel
interaction.reply, interaction.auto_reply_config
lead.assign, lead.sync
integration.manage, provider.manage
settings.manage, audit.view
```

**数据库变更**: Prisma schema 增加 Role 枚举, User 关联 Role

**验收**:
- API 路由受 Auth 保护
- Viewer 不能发送回复
- Sales 只能处理分配给自己的线索

### 3.3 审计日志基础设施

**文件**: `packages/observability/src/`

**需实现**:

```text
packages/observability/src/
├── audit-logger.ts    # 审计日志写入 (Prisma AuditLog 模型已存在)
├── middleware.ts       # API 路由审计中间件
└── secret-logger.ts   # Secret 变更审计
```

**必须记录的动作** (来自 specs_v1 07):

```text
登录、平台账号配置变更、密钥配置变更
开启/关闭自动回复、发送回复、人工审核回复
创建发布任务、执行发布、取消发布
同步飞书/企微、修改线索状态、删除/归档内容
```

**验收**: 关键操作自动写 AuditLog，不侵入业务代码

### 3.4 通知基础设施

**数据库**: Prisma 增加 Notification 模型

```prisma
model Notification {
  id        String   @id @default(cuid())
  type      String
  title     String
  content   String
  level     String   // info / warning / error / critical
  readAt    DateTime?
  actionUrl String?
  createdAt DateTime @default(now())
}
```

**通知类型**:

```text
高意向线索提醒、发布失败提醒、平台授权异常
Provider 熔断、飞书/企微同步失败、人工确认待办、调研任务完成
```

### 3.5 任务中心基础设施

**数据库**: Prisma 增加 SystemTask 模型

```prisma
model SystemTask {
  id               String   @id @default(cuid())
  taskType         String
  title            String
  status           String   // queued / running / success / failed / cancelled / suspended
  relatedEntityType String?
  relatedEntityId  String?
  progress         Int      @default(0)
  errorMessage     String?
  startedAt        DateTime?
  finishedAt       DateTime?
  createdBy        String?
  createdAt        DateTime @default(now())
}
```

**规则**: Worker 每个 job 自动创建/更新 SystemTask 记录

**API**:

```text
GET /api/tasks
GET /api/tasks/:id
POST /api/tasks/:id/retry
POST /api/tasks/:id/cancel
```

---

## 4. Phase 1：主内容流程闭环

**目标**: 跑通 `选题→内容→发布→互动→线索→复盘` 核心链路

### 4.1 AI Skill Engine

**packages/ai/src/**:

```text
packages/ai/src/
├── llm-client.ts       # LLM 调用封装 (Claude API, 支持多 Provider)
├── prompt-loader.ts    # 从 SKILL.md 加载 prompt 模板
├── schema-validator.ts # JSON Schema 输入输出校验
├── token-tracker.ts    # Token 用量记录
└── index.ts            # 导出 SkillRunner
```

**packages/skills/src/**:

```text
packages/skills/src/
├── runner.ts       # SkillRunner 接口实现 (specs_v1 05 §4)
├── registry.ts     # Skill 注册表
└── definitions/    # Skill 定义目录
    ├── content-writing/
    ├── platform-rewrite/
    ├── compliance-check/
    ├── lead-classification/
    ├── reply-suggestion/
    ├── research-insight/
    └── growth-review/
```

每个 Skill 定义包含:

```text
definitions/<skill-name>/
├── SKILL.md              # Prompt + 说明
├── schema/
│   ├── input.schema.json
│   └── output.schema.json
├── examples/
│   └── example-1.json
└── tests/
    └── <skill-name>.test.ts
```

**Skill 执行协议** (来自 specs_v1 05):

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

规则:
1. 运行前校验 input schema
2. 运行后校验 output schema
3. 失败必须写 SkillRun
4. 不允许无结构化输出
5. Token 用量必须记录

**验收**: content-writing 可生成标题/正文/脚本 | lead-classification 输出包含 leadLevel/confidence/riskLevel

### 4.2 内容生命周期

**API 增强** (`apps/api/src/routes.ts` 已有端点):

| 端点 | 增强内容 |
|------|----------|
| `POST /api/contents` | 创建 ContentItem, status=draft |
| `POST /api/contents/:id/generate-variants` | 调用 SkillRunner 生成 6 平台版本 |
| `POST /api/content-variants/:id/compliance-check` | 调用 compliance-check skill |
| `PATCH /api/content-variants/:id/approve` | 状态流转 + AuditLog |
| `POST /api/content-variants/:id/create-publish-job` | 发布前检查 + 创建 PublishJob |
| `POST /api/contents/:id/archive` | 归档，不可再创建发布任务 |

**状态机** (来自 specs_v1 06):

```text
draft -> editing -> ready_for_review -> approved -> scheduled -> published
approved -> archived
```

规则:
1. 只有 approved 的 ContentVariant 可以创建 PublishJob
2. 每个平台版本必须独立合规检测
3. 内容归档后不能创建新发布任务
4. published 后不能直接编辑，应创建 revision
5. 没有 approved 素材的视频内容不能创建发布任务

### 4.3 素材库

**API 增强**:

| 端点 | 增强内容 |
|------|----------|
| `POST /api/media/upload` | 上传到 MinIO (当前是本地磁盘) |
| `POST /api/media/import-url` | 外部 URL 导入 |
| `PATCH /api/media/:id/review` | 审核状态机 |
| `GET /api/media/:id/usages` | 素材使用记录 |
| `POST /api/media/:id/attach-to-content` | 关联内容 |

**新增实现**: `packages/connectors/src/storage/minio.ts` — MinIO 对象存储客户端

**审核状态机** (来自 specs_v1 04):

```text
pending_review -> approved
pending_review -> rejected
approved -> archived
rejected -> pending_review (可重新提交)
```

规则:
1. 新上传素材默认 pending_review
2. pending_review/rejected/archived 不能用于发布
3. 只有 approved 可用于 PublishJob

**发布前检查** (创建 PublishJob 时):

```text
1. 素材存在
2. reviewStatus=approved
3. fileType 符合目标平台要求
4. 视频大小、时长、格式在平台限制内
5. 图片数量在平台限制内
6. 不符合则阻止创建
```

**未来预留**: MediaGenerationProvider 接口 (当前为 DisabledProvider)

### 4.4 发布流程

**packages/providers/src/publish/** (新增):

```text
packages/providers/src/publish/
├── publish-provider.ts        # PublishProvider 接口
├── capabilities.ts            # 平台能力矩阵
├── sandbox-provider.ts        # 沙箱 Provider (开发测试用)
├── disabled-provider.ts       # 禁用 Provider
├── browser-assist-provider.ts # 调用 browser-runner
└── manual-confirm-provider.ts # 人工确认流程
```

**PublishProvider 接口** (来自 specs_v1 01):

```ts
export interface PublishProvider {
  getCapabilities(): Promise<PublishCapabilities>;
  publishTextImage(input: PublishTextImageInput): Promise<PublishResult>;
  publishVideo(input: PublishVideoInput): Promise<PublishResult>;
  publishArticle(input: PublishArticleInput): Promise<PublishResult>;
  fetchPublishStatus(input: FetchPublishStatusInput): Promise<PublishStatusResult>;
}
```

**平台发布能力矩阵** (来自 specs_v1 01 §3):

| 平台 | 图文 | 视频 | 文章 | P0 模式 |
|------|------|------|------|---------|
| 抖音 | 部分 | 支持 | - | official_api + browser_assist |
| 小红书 | 支持 | 支持 | - | browser_assist + skill |
| 公众号 | 图文文章 | 视频素材 | 文章 | official_api |
| 视频号 | 弱 | 视频为主 | - | browser_assist + manual |
| 百家号 | 图文 | 视频 | 文章 | official/browser_assist |
| 知乎 | 图文回答 | 弱 | 回答/文章 | browser_assist + manual |

**发布模式** (来自 specs_v1 01 §2):

```text
official_api     官方 API 发布
browser_assist   浏览器辅助填充和提交
manual_confirm   系统生成清单，人工发布
sandbox          测试账号/测试应用
recorded         录制真实响应后回放
disabled         禁用发布
```

**PublishJob 状态机** (来自 specs_v1 01 §5):

```text
draft -> scheduled -> queued -> publishing
publishing -> published | failed | waiting_browser_login | waiting_human_confirm
waiting_browser_login -> publishing
waiting_human_confirm -> published | failed
failed -> queued (重试)
scheduled/queued -> cancelled
```

**Worker job**: `publish.execute` — 发布执行处理器

### 4.5 互动 & 线索

**已有**: Interaction/Conversation/Lead CRUD 端点

**需增强**:

| 端点 | 增强内容 |
|------|----------|
| `POST /api/interactions/:id/classify` | 调用 lead-classification skill |
| `POST /api/interactions/:id/suggest-reply` | 调用 reply-suggestion skill |
| `POST /api/interactions/:id/convert-to-lead` | 意向识别后转 Lead |
| `POST /api/interactions/:id/reply` | 自动回复需 AuditLog + 人工审核流程 |

**规则**:
- 高风险消息不能自动回复，必须人工确认
- A/B 级线索触发通知

### 4.6 数据复盘

**数据库**: 新增 AnalyticsEvent 模型

```prisma
model AnalyticsEvent {
  id          String   @id @default(cuid())
  eventType   String
  platform    String?
  entityType  String?
  entityId    String?
  value       Float?
  metadata    Json?
  occurredAt  DateTime
  createdAt   DateTime @default(now())
}
```

**事件类型**:

```text
content_created, content_published, publish_failed
interaction_received, reply_sent
lead_created, lead_synced_feishu, lead_synced_wecom, lead_won, lead_lost
research_task_completed
```

**指标口径** (来自 specs_v1 07 §6):

| 指标 | 口径 |
|------|------|
| 内容发布数 | PublishJob.status=published |
| 互动数 | Interaction 总数 |
| 咨询数 | leadLevel=A/B/C 的互动数 |
| A 级线索数 | Lead.leadLevel=A |
| 内容获客率 | Lead 数 / Published Content 数 |
| 平台获客贡献 | 平台 Lead 数 / 总 Lead 数 |

**聚合 Worker**: `analytics.aggregate.daily`, `analytics.aggregate.weekly`

---

## 5. Phase 2：调研与外部集成

### 5.1 Research Runner

**文件**: `apps/research-runner/src/`

**当前状态**: 仅脚手架

**需实现**:

```text
apps/research-runner/src/
├── index.ts
├── server.ts           # HTTP 服务
├── routes.ts           # 调研执行端点
└── providers/
    ├── recorded-provider.ts      # 录制回放
    ├── manual-import-provider.ts # 手动导入 CSV/Excel/JSON
    └── media-crawler-provider.ts # MediaCrawler 集成
```

**ResearchProvider 接口** (来自 specs_v1 02):

```ts
export interface ResearchProvider {
  getCapabilities(): Promise<ResearchCapabilities>;
  searchPosts(input: SearchPostsInput): Promise<CollectedPostDTO[]>;
  collectPostComments(input: CollectCommentsInput): Promise<CollectedCommentDTO[]>;
  collectCreatorPosts(input: CollectCreatorInput): Promise<CollectedPostDTO[]>;
}
```

**ResearchTask 状态机**:

```text
draft -> scheduled -> queued -> running -> success/failed
running -> paused (手动暂停)
连续失败超阈值 -> suspended (需人工恢复)
```

**限频规则**:
- real_crawler 必须启用 rateLimitPolicy
- 所有任务受 maxPosts/maxComments 限制
- 连续失败超阈值进入 suspended

**AI 洞察输出**: painPoints, popularTopics, contentAngles, suggestedOpportunities

**验收**: 调研任务可执行并入库 | AI 洞察生成 ResearchInsight | ContentOpportunity 可转 ContentItem

### 5.2 Lead Sinks

**文件**: `packages/lead-sinks/src/`

**当前状态**: 仅脚手架

**需实现**:

```text
packages/lead-sinks/src/
├── types.ts                # LeadSinkProvider 接口
├── field-mapper.ts         # 字段映射引擎
├── idempotent-sync.ts      # 幂等同步逻辑
├── feishu-bitable-sink.ts  # 飞书多维表格同步
├── feishu-bot-sink.ts      # 飞书群机器人通知
├── wecom-contact-sink.ts   # 企微客户承接
├── wecom-message-sink.ts   # 企微应用消息
└── crm-webhook-sink.ts     # 第三方 CRM
```

**Lead Sink 类型** (来自 specs_v1 03):

| Sink | 用途 |
|------|------|
| feishu_bitable | 线索写入飞书多维表格 |
| feishu_bot | A/B 级线索群提醒 |
| wecom_contact | 企微客户承接 |
| wecom_app_message | 企微应用消息提醒 |
| crm_webhook | 第三方 CRM |

**幂等规则**:
1. 同一个 leadId + sinkType 只能创建一个 LeadExternalMapping
2. 已有 externalId 时同步动作为 update 而非 create
3. 同步失败不能删除本地 Lead
4. 飞书/企微不可用时必须写失败日志并可重试

**验收**: A 级线索同步飞书创建外部记录 | 重复同步不重复创建 | 同步失败写 LeadSinkSyncLog

### 5.3 Provider Gateway

**文件**: `apps/provider-gateway/src/`

**当前状态**: 仅脚手架

**需实现**:

```text
apps/provider-gateway/src/
├── index.ts
├── server.ts        # HTTP 服务
├── gateway.ts       # Provider 路由分发
├── health-check.ts  # Provider 健康检查
└── run-log.ts       # ProviderRunLog 记录
```

**Gateway 规则**:
1. 业务模块不能直接调用开源工具，必须通过 Gateway
2. Provider 必须记录 ProviderRunLog
3. Provider 失败不能污染主数据
4. Provider 输出必须经过 schema 校验
5. Provider 能力必须可查询

### 5.4 Connectors

**文件**: `packages/connectors/src/`

**需实现**:

```text
packages/connectors/src/
├── storage/
│   └── minio.ts         # MinIO 客户端
├── feishu/
│   └── client.ts        # 飞书 SDK 封装
├── wecom/
│   └── client.ts        # 企微 SDK 封装
├── media-crawler/
│   └── client.ts        # MediaCrawler 封装
└── social-publish/
    └── client.ts        # social-auto-upload 封装
```

---

## 6. Phase 3：前端全面实现

**模式**: 复用已有组件 (DataTable, StatusBadge, ConfirmDialog, EmptyState, ErrorState, LoadingState, FileUpload, BrowserLoginDialog) + API client 层

### 6.1 内容管理页面

| 页面 | 路径 | 优先级 |
|------|------|--------|
| 内容库 | `/content` | P0 |
| 新建内容 | `/content/new` | P0 |
| 内容详情 | `/content/[id]` | P0 |
| 平台版本 | `/content/variants` | P1 |
| 内容日历 | `/content/calendar` | P1 |
| 内容模板 | `/content/templates` | P2 |

### 6.2 发布管理页面

| 页面 | 路径 | 优先级 |
|------|------|--------|
| 发布任务列表 | `/publish` | P0 |
| 发布任务详情 | `/publish/jobs/[id]` | P0 |
| 人工发布待办 | `/publish/manual` | P1 |
| 发布日历 | `/publish/calendar` | P1 |
| 发布队列 | `/publish/queue` | P1 |
| 发布记录 | `/publish/attempts` | P2 |

### 6.3 调研页面

| 页面 | 路径 | 优先级 |
|------|------|--------|
| 调研任务列表 | `/research` | P1 |
| 新建调研 | `/research/new` | P1 |
| 任务详情 | `/research/tasks/[id]` | P1 |
| AI 洞察 | `/research/insights` | P1 |
| 选题机会 | `/research/opportunities` | P1 |
| 手动导入 | `/research/import` | P2 |

### 6.4 素材库页面

| 页面 | 路径 | 优先级 |
|------|------|--------|
| 素材库 | `/media` | P0 |
| 上传素材 | `/media/upload` | P0 |
| 素材审核 | `/media/review` | P1 |
| 素材详情 | `/media/[id]` | P1 |
| 未来生成 | `/media/generation` | P2 (禁用态) |

### 6.5 互动与线索页面

| 页面 | 路径 | 优先级 |
|------|------|--------|
| 会话列表 | `/conversations` | P0 |
| 会话详情 | `/conversations/[id]` | P0 |
| 线索列表 | `/leads` | P0 |
| 线索详情 | `/leads/[id]` | P0 |
| 线索漏斗 | `/leads/pipeline` | P1 |
| 同步日志 | `/leads/sync` | P1 |

### 6.6 集成与设置页面

| 页面 | 路径 | 优先级 |
|------|------|--------|
| 飞书配置 | `/integrations/feishu` | P1 |
| 企微配置 | `/integrations/wecom` | P1 |
| Provider 管理 | `/integrations/providers` | P1 |
| Skill 管理 | `/settings/skills` | P1 |
| Skill 运行记录 | `/settings/skills/runs` | P2 |
| 团队管理 | `/settings/team` | P2 |
| 审计日志 | `/settings/audit-logs` | P2 |
| 导入导出 | `/settings/data` | P2 |

### 6.7 分析复盘页面

| 页面 | 路径 | 优先级 |
|------|------|--------|
| 总览 | `/analytics` | P1 |
| 内容 ROI | `/analytics/content` | P1 |
| 线索趋势 | `/analytics/lead` | P1 |
| 平台贡献 | `/analytics/platform` | P1 |

### 6.8 任务中心 & 通知

| 页面/组件 | 路径 | 优先级 |
|-----------|------|--------|
| 任务中心 | `/tasks` | P1 |
| 通知铃铛 | Topbar 集成 | P1 |

---

## 7. Phase 4：安全与数据管理

### 7.1 RBAC 完善

**角色权限矩阵** (来自 specs_v1 07 §3):

| 权限 | Admin | Operator | Sales | Viewer |
|------|-------|----------|-------|--------|
| content.create | ✅ | ✅ | ❌ | ❌ |
| content.approve | ✅ | ✅ | ❌ | ❌ |
| publish.execute | ✅ | ✅ | ❌ | ❌ |
| interaction.reply | ✅ | ✅ | ✅ (已分配) | ❌ |
| lead.assign | ✅ | ❌ | ❌ | ❌ |
| integration.manage | ✅ | ❌ | ❌ | ❌ |
| audit.view | ✅ | ❌ | ❌ | ❌ |

### 7.2 Secret 安全

**数据库**: 新增 SecretRef 模型

```prisma
model SecretRef {
  id             String   @id @default(cuid())
  scope          String
  key            String
  encryptedValue String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

**规则**:
1. API Key、App Secret、Access Token 必须加密存储
2. 前端永不返回明文 Secret
3. 日志不得记录明文 Secret
4. Secret 更新必须写 AuditLog

### 7.3 数据导入导出

**导入支持**:
- CSV 导入评论
- CSV 导入线索
- Excel 导入历史客户
- JSON 导入调研结果
- 素材批量上传

**导出支持**:
- 线索导出 CSV/Excel
- 发布任务导出
- 互动数据导出
- 复盘报告导出
- 审计日志导出 (仅 Admin)

### 7.4 备份恢复

```text
PostgreSQL pg_dump
MinIO mc mirror
配置 JSON 导出
Skill 包导出
```

---

## 8. Phase 5：测试完善

### 8.1 状态机测试

| 状态机 | 当前状态 | 需新增 |
|--------|----------|--------|
| PublishJob | ✅ 已有测试 | 增强 waiting_browser_login 分支 |
| Interaction | ✅ 已有测试 | 增强 waiting_human_review 分支 |
| Lead | ✅ 已有测试 | 增强 syncing 分支 |
| MediaAsset | ✅ 已有测试 | - |
| ContentItem | ❌ | 新增 |
| ResearchTask | ❌ | 新增 |

### 8.2 Provider Contract Tests

每个 Provider 必须测试:

```text
PublishProvider (sandbox, disabled, browser-assist, manual-confirm)
ResearchProvider (recorded, manual-import, media-crawler)
LeadSinkProvider (feishu-bitable, feishu-bot, wecom-contact, wecom-message, crm-webhook)
MediaGenerationProvider (disabled, mock)
```

### 8.3 集成测试

| 测试流程 | 覆盖范围 |
|----------|----------|
| 内容→发布全流程 | ContentItem → ContentVariant → ComplianceCheck → PublishJob → PublishAttempt |
| 调研→洞察→选题→内容 | ResearchTask → CollectedPost → ResearchInsight → ContentOpportunity → ContentItem |
| 互动→线索→飞书/企微 | Interaction → Lead → LeadExternalMapping → LeadSinkSyncLog |
| 素材→发布约束 | MediaAsset (pending_review) → 阻止创建 PublishJob → approved → 允许发布 |

### 8.4 E2E 测试

主流程端到端验收:

```text
1. 登录
2. 配置平台账号 (Browser Login)
3. 上传素材 + 审核
4. 创建内容 → 生成平台版本
5. 合规检测 → 审批
6. 创建发布任务 → 执行发布 (sandbox)
7. Mock 评论/私信同步
8. AI 线索分类
9. A 级线索同步飞书/企微
10. 查看复盘看板
11. 导出报告
```

---

## 9. AI 编码执行顺序

建议给 Codex / Claude Code 分批次执行:

### 批次 0: 基础设施

1. Worker 队列 (BullMQ + Redis)
2. Auth 中间件 + RBAC 框架
3. 审计日志 + 通知 + 任务中心
4. 数据库迁移 (新增 Notification, SystemTask, SecretRef, AnalyticsEvent)

### 批次 1: AI Skill Engine

5. packages/ai (LLM 客户端 + Schema 校验 + Token 追踪)
6. packages/skills (Runner + Registry)
7. 7 个核心 Skill 定义 (content-writing, platform-rewrite, compliance-check, lead-classification, reply-suggestion, research-insight, growth-review)

### 批次 2: 内容流程

8. 内容生命周期 API 增强
9. 素材库 MinIO 集成 + 审核状态机
10. 发布 Provider (sandbox, disabled, browser-assist, manual-confirm)
11. 发布 Worker + 状态机

### 批次 3: 互动线索

12. 互动 AI 增强 (classify, suggest-reply, convert-to-lead)
13. Analytics 事件采集 + 聚合

### 批次 4: 外部集成

14. Research Runner
15. Lead Sinks (飞书/企微)
16. Provider Gateway
17. Connectors (MinIO, 飞书, 企微, MediaCrawler)

### 批次 5: 前端

18. P0 前端页面 (内容/发布/互动/线索/素材)
19. P1 前端页面 (调研/集成/设置/分析)
20. P2 前端页面 (模板/备份/高级功能)

### 批次 6: 测试

21. 状态机测试补充
22. Provider Contract Tests
23. 集成测试
24. E2E 测试

---

## 10. 开发完成标准

项目完成不是"代码生成完"，而是满足:

```text
1. 每个页面按钮真实可执行
2. 每个核心流程真实入库
3. 每个异步任务真实进入队列
4. 每个 Provider 有可替换实现
5. 每个失败路径有降级策略
6. 每个关键动作可审计
7. 每个 P0 功能有测试验证
```

验收命令:

```bash
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
docker compose up
```

全部通过。
