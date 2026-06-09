# 06. Codex / Claude Code 执行 Prompt v9

## 1. 总执行原则 Prompt

```text
你是资深全栈架构师和工程实现 Agent。请严格按照 docs 中的 PRD、技术架构、SDD 和 TDD 计划实现 AI 全域内容获客运营系统。

项目目标：
面向单品牌自用，支持抖音、小红书、微信公众号、微信视频号、百家号、知乎的文案/脚本/标题生成、图文/视频素材管理与发布、评论私信承接、AI 线索识别、飞书/企微沉淀、Research Ops 和数据复盘。当前 MVP 不实现真实 AI 生图、生视频、视频剪辑、数字人、配音和字幕自动生成，但需要预留 Media Generation Provider 接口、Mock Provider、Disabled Provider、素材审核状态机，方便后续插件式接入。

硬性要求：
1. 使用 SDD 指导代码结构。
2. 使用 TDD，先写测试再写实现。
3. 所有外部平台必须通过 Provider Gateway。
4. 先实现 Mock Provider，保证 E2E 全链路可运行。
5. Real Provider 后续逐步实现，不得阻塞主流程。
6. 所有核心数据保存在 PostgreSQL。
7. 图片、视频、截图、报告保存在 MinIO。
8. Redis + BullMQ 负责异步任务。
9. 飞书/企微只是线索同步目标，不是主数据库。
10. MediaCrawler 只用于低频公开数据调研，不用于私信采集或主动触达。
10.1 当前不得接入真实生图/生视频模型；只允许实现 MediaGenerationProvider 接口、Mock Provider 和 Disabled Provider。
11. AI 输出必须通过 Schema 校验。
12. 高风险消息不能自动回复，必须人工确认。
13. 每个阶段完成后运行 lint、test、build。

不要一次性生成全部系统。请按阶段执行，每次只完成一个阶段，确保测试通过后再进入下一阶段。
```

---

## 2. 阶段 1：项目初始化 Prompt

```text
请初始化项目骨架。

要求：
1. 使用 pnpm workspace。
2. 创建 apps/web、apps/api、apps/worker、apps/provider-gateway、apps/browser-runner、apps/research-runner。
3. 创建 packages/shared、packages/database、packages/connectors、packages/providers、packages/skills、packages/ai、packages/lead-sinks、packages/observability。
4. 配置 TypeScript、ESLint、Prettier。
5. 配置 Vitest/Jest。
6. 配置 Docker Compose，包含 postgres、redis、minio。
7. 创建 README 和 .env.example。
8. 添加基础 health check。
9. 运行 lint 和 test。

验收：
- pnpm install 成功。
- pnpm lint 成功。
- pnpm test 成功。
- docker compose up 可启动基础服务。
```

---

## 3. 阶段 2：数据库模型 Prompt

```text
请基于 SDD 生成 Prisma Schema、migration、seed 和 Repository 测试。

必须包含以下实体：
User、PlatformAccount、PlatformCapability、ContentProject、ContentItem、ContentVariant、MediaAsset、PublishJob、PublishAttempt、Interaction、Conversation、Lead、LeadActivity、LeadSinkConfig、LeadExternalMapping、LeadSinkSyncLog、ResearchTask、ResearchKeyword、ResearchTargetAccount、CollectedPost、CollectedComment、ResearchInsight、ContentOpportunity、SkillRun、AgentRun、ProviderRunLog、AuditLog。

要求：
1. 每个核心实体包含 userId、createdAt、updatedAt。
2. 关键外键关系完整。
3. 关键唯一约束完整。
4. Seed 生成 6 个平台账号、一个内容项目、若干 Mock 数据。
5. 为 Repository 编写 CRUD 测试。

执行顺序：
1. 先写数据库测试。
2. 再写 Schema。
3. 再写 Repository。
4. 运行测试并修复。
```

---

## 4. 阶段 3：共享类型和状态机 Prompt

```text
请生成 packages/shared 中的平台、内容、发布、互动、线索、Research、Provider 相关类型。

必须实现：
1. Platform 类型。
2. ProviderMode 类型。
3. PublishJobStatus 类型。
4. LeadLevel 和 LeadStatus 类型。
5. InteractionStatus 类型。
6. ResearchTaskStatus 类型。
7. PlatformCapabilities 类型。
8. PublishJob 状态机函数。
9. Lead 状态机函数。
10. Interaction 状态机函数。

要求：
- 先写状态机测试。
- 合法转换通过。
- 非法转换抛出 STATE_TRANSITION_INVALID。
- 终态不可非法变更。
```

---

## 5. 阶段 4：Mock Provider Prompt

```text
请实现 Provider Gateway 和 Mock Provider。

必须实现：
1. PublishProvider 接口。
2. ResearchProvider 接口。
3. LeadSinkProvider 接口。
4. AIProvider 接口。
5. MockPublishProvider。
6. MockResearchProvider。
7. MockFeishuLeadSinkProvider。
8. MockWeComLeadSinkProvider。
9. MockAIProvider。
10. ProviderRunLog 记录。

要求：
- 所有 Provider 输入输出使用 Zod 校验。
- 所有 Provider 调用必须记录日志。
- MockPublishProvider 支持 6 平台图文和视频发布。
- MockResearchProvider 支持公开内容和评论样本。
- MockAIProvider 支持文案/脚本/标题生成、线索分类、回复建议。
```

---

## 6. 阶段 5：Content + Publish 闭环 Prompt

```text
请实现 Content Ops 和 Publish Ops 的后端、队列、前端页面和测试。

后端 API：
- /api/content-projects
- /api/content-items
- /api/content-variants
- /api/media-assets
- /api/publish-jobs

队列：
- publish.schedule
- publish.execute

前端页面：
- /content/projects
- /content/items
- /content/calendar
- /publish/jobs

必须跑通：
1. 创建内容项目。
2. 创建图文内容。
3. 创建视频内容。
4. 生成 6 平台 ContentVariant。
5. 创建 12 个 PublishJob。
6. 使用 MockPublishProvider 发布。
7. 状态全部进入 PUBLISHED。

请先写 API 和 E2E 测试，再实现功能。
```

---

## 7. 阶段 6：AI Skill Runner Prompt

```text
请实现 AI Skill Runner。

必须实现：
1. AIProvider 抽象。
2. OpenAI-compatible Provider 外壳。
3. MockAIProvider。
4. SkillRunner。
5. SkillRun 日志。
6. Zod 输出校验。
7. JSON repair 机制。

必须实现 Skill：
- topic-generation
- platform-rewrite
- compliance-check
- lead-classification
- reply-suggestion
- public-comment-insight
- growth-review

每个 Skill 需要：
- SKILL.md
- prompt.md
- schema.ts
- examples
- tests
```

---

## 8. 阶段 7：Conversation + Lead Prompt

```text
请实现 Conversation Ops 和 Lead Ops。

后端 API：
- /api/interactions
- /api/conversations
- /api/leads

队列：
- interaction.sync
- conversation.reply_suggest
- lead.classify

功能：
1. Mock 评论/私信入库。
2. Interaction 去重。
3. AI 线索评分。
4. AI 回复建议。
5. Reply Policy Engine。
6. 高风险消息人工确认。
7. Lead 创建和去重。
8. LeadActivity 记录。

测试：
- A/B/C/D 线索识别。
- 高风险不自动回复。
- 重复用户合并线索。
```

---

## 9. 阶段 8：飞书/企微沉淀 Prompt

```text
请实现飞书和企微 Lead Sink。

后端 API：
- /api/lead-sinks
- /api/leads/:id/sync-feishu
- /api/leads/:id/sync-wecom
- /api/leads/:id/notify-sales

队列：
- lead.sync.feishu
- lead.sync.wecom

功能：
1. 飞书多维表格配置。
2. 飞书群机器人配置。
3. 企业微信应用配置。
4. 企业微信销售人员配置。
5. A/B 级线索自动同步。
6. 同步失败重试。
7. LeadExternalMapping。
8. LeadSinkSyncLog。

先实现 Mock，再预留 Real Provider。
```

---

## 10. 阶段 9：Research Ops Prompt

```text
请实现 Research Ops。

后端 API：
- /api/research-tasks
- /api/research-keywords
- /api/research-target-accounts
- /api/research-insights
- /api/content-opportunities

队列：
- research.run
- research.analyze

Provider：
- MockResearchProvider
- MediaCrawlerResearchProvider 外壳

功能：
1. 创建关键词调研任务。
2. 创建竞品账号调研任务。
3. 调用 MockResearchProvider 返回公开内容和评论样本。
4. AI 分析评论痛点。
5. 生成选题机会。
6. 支持限频和熔断。

注意：
MediaCrawler 只用于公开内容和公开评论，不得用于私信采集。
```

---

## 11. 阶段 10：Analytics Prompt

```text
请实现 Growth Analytics。

后端 API：
- /api/analytics/overview
- /api/analytics/platforms
- /api/analytics/content-roi
- /api/analytics/leads
- /api/analytics/research-to-content

前端页面：
- /dashboard
- /analytics

指标：
1. 平台发布数量。
2. 内容互动数量。
3. 线索数量。
4. A/B/C/D 分布。
5. 飞书/企微同步成功率。
6. 发布成功率。
7. 内容获客率。
8. Research 到 Content 到 Lead 归因。
9. 周报生成。
```

---

## 12. 阶段 11：前端完整页面 Prompt

```text
请完善前端页面。

页面：
- /dashboard
- /accounts
- /content/projects
- /content/items
- /content/calendar
- /publish/jobs
- /conversations
- /leads
- /research
- /research/insights
- /lead-sinks
- /analytics
- /settings/ai
- /settings/providers
- /system/logs

要求：
1. 使用 shadcn/ui。
2. 使用 TanStack Query。
3. 所有列表支持筛选。
4. 状态使用 StatusBadge。
5. 线索等级使用 LeadLevelBadge。
6. 发布详情显示时间线。
7. Provider 日志可查看。
8. 页面空状态友好。
```

---

## 13. 阶段 12：E2E 验收 Prompt

```text
请实现完整 E2E 测试。

测试流程：
1. 登录。
2. 创建 6 平台账号。
3. 创建内容项目。
4. 输入运营目标。
5. 生成选题。
6. 生成图文和视频内容。
7. 生成 6 平台版本。
8. 创建 12 个发布任务。
9. Mock 发布成功。
10. Mock 同步评论/私信。
11. AI 线索评分。
12. A/B 级线索同步飞书和企微。
13. 查看复盘看板。

要求：
- 测试稳定。
- 不依赖真实平台。
- 不依赖真实 AI API。
- 不依赖真实飞书/企微。
```

---

## 14. 修复循环 Prompt

```text
请运行：

pnpm lint
pnpm test
pnpm test:e2e
pnpm build

如果失败，请不要跳过测试。请根据错误逐项修复，直到全部通过。

修复时遵循：
1. 不删除测试来通过。
2. 不移除核心功能。
3. 不用 any 绕过类型错误，除非有明确理由。
4. 不跳过失败测试。
5. 修复后更新相关文档。
```

---

## 14. 阶段 0：基础设施 Prompt

```text
请实现系统基础设施层。

要求：
1. Worker 队列基础设施 (apps/worker/src/)
   - BullMQ 队列工厂 + Redis 连接
   - Worker 注册与事件处理
   - 统一重试策略 (指数退避, maxRetries=3)
   - 所有作业类型定义
   - 每个 job handler 自动创建/更新 SystemTask

2. Auth 中间件 (apps/api/src/middleware/)
   - JWT/Session 认证中间件
   - RBAC 角色权限检查 (Admin/Operator/Sales/Viewer)
   - 权限点定义 (content.create, publish.execute, lead.assign 等)

3. 审计日志 (packages/observability/src/)
   - audit-logger.ts — 关键动作自动写 AuditLog
   - middleware.ts — API 路由审计中间件
   - secret-logger.ts — Secret 变更审计

4. 通知 (packages/observability/src/notifier.ts)
   - 高意向线索、发布失败、平台异常等通知创建

5. 数据库变更
   - 新增 Notification 模型
   - 新增 SystemTask 模型
   - 新增 SecretRef 模型
   - User 关联 Role

验收：
- Worker 可消费 Redis 队列
- API 路由受 Auth 保护
- 关键操作写 AuditLog
- 任务可在 SystemTask 中查看
```

---

## 15. 模块级执行 Prompt

### 15.1 发布 Provider 执行 Prompt

```text
请实现发布 Provider 层。

目录：packages/providers/src/publish/

必须实现：
1. PublishProvider 接口 (getCapabilities, publishTextImage, publishVideo, publishArticle, fetchPublishStatus)
2. PublishCapabilities 类型 (平台能力矩阵)
3. SandboxProvider — 沙箱环境发布
4. DisabledProvider — 禁用发布
5. BrowserAssistProvider — 调用 browser-runner
6. ManualConfirmProvider — 人工确认流程

PublishJob 状态机：
draft -> scheduled -> queued -> publishing
publishing -> published | failed | waiting_browser_login | waiting_human_confirm
failed -> queued (重试)

平台能力矩阵：
- 抖音: official_api + browser_assist
- 小红书: browser_assist + skill
- 公众号: official_api
- 视频号: browser_assist + manual
- 百家号: official/browser_assist
- 知乎: browser_assist + manual

数据模型：PublishJob, PublishAttempt, ManualPublishChecklist, BrowserSession

验收：
- sandbox provider 可成功模拟 6 平台发布
- 发布状态机流转正确
- PublishAttempt 记录每次尝试
- 不支持能力时返回明确错误
- Contract Test 覆盖每个 Provider
```

### 15.2 素材库执行 Prompt

```text
请实现素材库管理。

要求：
1. MinIO 对象存储集成 (packages/connectors/src/storage/minio.ts)
   - 上传文件到 MinIO
   - 生成预览 URL
   - 删除文件

2. MediaAsset 生命周期
   - 上传默认 pending_review
   - 审核状态机: pending_review -> approved/rejected -> archived
   - 只有 approved 可用于 PublishJob

3. API 端点
   - POST /api/media/upload — 上传到 MinIO
   - POST /api/media/import-url — 外部 URL 导入
   - PATCH /api/media/:id/review — 审核
   - GET /api/media/:id/usages — 使用记录

4. 发布前检查 (创建 PublishJob 时)
   - 素材存在 + reviewStatus=approved
   - fileType 符合平台要求
   - 视频大小/时长限制
   - 图片数量限制

5. MediaGenerationProvider 预留
   - DisabledMediaGenerationProvider
   - MockMediaGenerationProvider

验收：
- 上传文件写入 MinIO + MediaAsset 写入 DB
- 默认 pending_review
- approved 后可关联内容
- 未审核素材不能创建发布任务
- DisabledProvider 调用返回明确错误
```

### 15.3 内容生命周期执行 Prompt

```text
请实现内容生命周期管理。

核心链路：ContentOpportunity → ContentItem → ContentVariant → ComplianceCheck → PublishJob

状态机：
draft -> editing -> ready_for_review -> approved -> scheduled -> published
approved -> archived

API 增强：
- POST /api/contents — 创建 ContentItem (status=draft)
- POST /api/contents/:id/generate-variants — 调用 SkillRunner 生成 6 平台版本
- POST /api/content-variants/:id/compliance-check — 调用 compliance-check skill
- PATCH /api/content-variants/:id/approve — 状态流转 + AuditLog
- POST /api/content-variants/:id/create-publish-job — 发布前检查 + 创建 PublishJob

规则：
1. 只有 approved 的 ContentVariant 可以创建 PublishJob
2. 每个平台版本必须独立合规检测
3. published 后不能直接编辑，应创建 revision
4. 没有 approved 素材的视频内容不能创建发布任务

验收：
- 新建内容默认为 draft
- 生成 6 平台 ContentVariant
- 平台版本不能重复生成相同平台
- 合规检测失败时不能 approve
- approved 版本可创建 PublishJob
```

### 15.4 Lead Sink 执行 Prompt

```text
请实现 Lead Sink 模块。

目录：packages/lead-sinks/src/

必须实现：
1. LeadSinkProvider 接口
2. field-mapper.ts — 字段映射引擎
3. idempotent-sync.ts — 幂等同步逻辑
4. feishu-bitable-sink.ts — 飞书多维表格同步
5. feishu-bot-sink.ts — 飞书群机器人通知
6. wecom-contact-sink.ts — 企微客户承接
7. wecom-message-sink.ts — 企微应用消息
8. crm-webhook-sink.ts — 第三方 CRM

幂等规则：
1. 同一个 leadId + sinkType 只能创建一个 LeadExternalMapping
2. 已有 externalId 时为 update 而非 create
3. 同步失败不能删除本地 Lead
4. 飞书/企微不可用时写失败日志

数据模型：LeadSinkConfig, LeadExternalMapping, LeadSinkSyncLog

队列任务：lead.sync.*, lead.notify.*

验收：
- A 级线索同步飞书创建外部记录
- 重复同步不重复创建
- 同步失败写 LeadSinkSyncLog
- 飞书群通知失败不影响 Lead 主数据
- 字段映射缺失返回明确错误
```

### 15.5 Interaction Ops 执行 Prompt（specs_v1 评论私信Spec）

```text
请实现 Interaction Ops 模块（评论/私信拉取与回复）。

目录：packages/connectors/src/interaction/

必须实现：
1. InteractionConnector 接口
   - getCapabilities, fetchComments, fetchMessages
   - replyComment, replyMessage, markHandled

2. Connector 实现
   - RecordedInteractionConnector — 录制回放
   - ManualImportConnector — 手动导入 CSV/Excel
   - SandboxConnector — 沙箱测试
   - DisabledConnector — 禁用
   - DouyinInteractionConnector — 抖音 skeleton
   - WechatOfficialInteractionConnector — 公众号 skeleton

3. 数据模型 (Prisma)
   - InteractionClassification: intent, leadLevel, confidence, riskLevel, summary, tags, nextAction
   - ReplySuggestion: suggestedText, replyType, riskLevel, needReview, decision, status
   - ReplyAttempt: platform, providerMode, status, externalReplyId, errorCode
   - InteractionSyncJob: syncType, mode, status, cursor, fetchedCount

4. 状态机
   - Interaction: new → classified → reply_suggested → waiting_human_review → replied
   - ReplySuggestion: draft → waiting_review → approved → sent
   - needReview=true 时不能 draft → sent
   - riskLevel=high 时必须 waiting_review

5. Reply Policy Engine
   - riskLevel=high → require_human_review
   - leadLevel=A → require_human_review
   - confidence < 0.75 → require_human_review
   - 包含手机号/微信号/外链 → require_human_review
   - 平台不支持回复 → manual_only
   - 普通 FAQ + low risk + confidence>=0.85 → auto_send

6. API 端点
   - POST /api/interactions/sync — 创建同步任务
   - GET /api/interactions — 查询互动列表
   - GET /api/conversations — 会话列表
   - GET /api/conversations/:id — 会话详情
   - POST /api/interactions/:id/classify — AI 意向识别
   - POST /api/interactions/:id/suggest-reply — 生成回复建议
   - POST /api/interactions/:id/reply — 发送回复
   - POST /api/reply-suggestions/:id/review — 人工审核回复
   - POST /api/interactions/:id/convert-to-lead — 转线索
   - POST /api/interactions/:id/ignore — 忽略
   - GET /api/interactions/:id/reply-attempts — 回复日志

7. 队列任务
   - interaction.sync.comments, interaction.sync.messages
   - interaction.classify, interaction.suggest_reply, interaction.send_reply

8. 前端页面
   - /conversations — 统一收件箱
   - /conversations/[id] — 会话详情 (消息流+回复编辑器+AI面板)
   - /conversations/review — 人工确认队列
   - /conversations/sync-jobs — 同步任务

禁止：
- 使用前端 Mock 数据
- MediaCrawler 拉取私信
- 默认全自动私信回复
- 绕过验证码/风控
- 删除失败测试

验收：
- Interaction 状态机测试通过
- ReplySuggestion 状态机测试通过
- Reply Policy Engine 规则测试通过
- 每个 Connector 有 Contract Test
- 低风险回复可自动发送
- 高风险回复进入人工确认
- A 级线索转 Lead 并触发飞书/企微同步
- 所有回复动作有 ReplyAttempt 和 AuditLog
```

### 15.6 Research Runner 执行 Prompt

```text
请实现 Research Runner。

目录：apps/research-runner/src/

必须实现：
1. HTTP 服务和路由
2. ResearchProvider 接口
3. RecordedProvider — 录制回放
4. ManualImportProvider — 手动导入 CSV/Excel/JSON
5. MediaCrawlerProvider — MediaCrawler 集成 (限频+熔断)

状态机：
draft -> scheduled -> queued -> running -> success/failed
running -> paused
连续失败超阈值 -> suspended

限频规则：
- real_crawler 必须启用 rateLimitPolicy
- 所有任务受 maxPosts/maxComments 限制
- 连续失败超阈值需人工恢复

禁止：
- 采集私信、非公开数据
- 绕过验证码或风控
- 高频批量爬取
- 作为对外数据采集服务

AI 洞察输出：painPoints, popularTopics, contentAngles, suggestedOpportunities

验收：
- 调研任务可执行并入库
- maxPosts/maxComments 生效
- 采集结果去重
- 连续失败熔断
- AI 洞察生成 ResearchInsight
- ContentOpportunity 可转 ContentItem
```

### 15.7 Provider Gateway 执行 Prompt

````text
请实现 Provider Gateway。

目录：apps/provider-gateway/src/

必须实现：
1. HTTP 服务
2. Provider 路由分发
3. Provider 健康检查
4. ProviderRunLog 记录

规则：
1. 业务模块不能直接调用开源工具
2. 所有调用记录 ProviderRunLog
3. Provider 失败不能污染主数据
4. Provider 输出必须经过 schema 校验
5. Provider 能力必须可查询

接口：
```ts
export interface ExternalProvider {
  name: string;
  type: string;
  mode: ProviderMode;
  healthCheck(): Promise<ProviderHealth>;
}
````

验收：

- Provider healthCheck 可运行
- Provider 失败写 ProviderRunLog
- Disabled Provider 调用返回明确错误
- 业务模块不能绕过 Gateway

````

### 15.8 审计与安全执行 Prompt

```text
请实现审计、权限和安全模块。

1. RBAC 权限 (apps/api/src/middleware/rbac.ts)
   - 角色: Admin / Operator / Sales / Viewer
   - 权限点: content.create, content.approve, publish.execute, lead.assign 等
   - 前端路由守卫 + 按钮权限

2. Secret 安全
   - SecretRef 模型 (scope, key, encryptedValue)
   - AES-256 加密存储
   - 前端永不返回明文
   - 日志不得记录明文

3. 数据导入导出
   - CSV/Excel 导入评论/线索/客户
   - CSV/Excel 导出线索/发布/互动/审计
   - 备份: PostgreSQL dump + MinIO sync

验收：
- Viewer 不能发送回复
- Sales 只能处理分配给自己的线索
- Secret 不在 API 响应中明文返回
- 导出文件生成并记录日志
- 备份命令可执行并产生文件
````

## 16. 阶段 13：未来 Media Generation 预留 Prompt

```text
请实现未来 Media Generation Provider 的预留能力，但不得接入任何真实生图/生视频模型。

要求：
1. 新增 packages/providers/media-generation。
2. 定义 MediaGenerationProvider 接口。
3. 实现 MockMediaGenerationProvider。
4. 实现 DisabledMediaGenerationProvider。
5. 扩展 MediaAsset 字段：sourceType、reviewStatus、generationProvider、generationJobId、costEstimate。
6. 实现素材审核状态机。
7. 未审核素材不能进入 PublishJob。
8. 编写单元测试和集成测试。
9. 不允许出现真实 Stable Diffusion、Midjourney、Runway、Pika、可灵、Sora、ComfyUI 调用。

验收：
- Mock Provider 返回模拟素材 metadata。
- 生成素材默认 pending_review。
- approved 后才能关联发布任务。
- Disabled Provider 调用返回明确错误。
- pnpm test 通过。
```
