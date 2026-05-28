# AI 全域内容获客运营系统｜AI 自主测试用例编写与验证 Spec v1.0

> 本文档用于指导 Codex / Claude Code / Cursor / 其他 AI 编码工具，在开发本项目时按照 TDD 方式自动编写测试、执行验证、修复失败，并输出可验收测试报告。  
> 适用项目：单品牌自用的 AI 全域内容获客运营系统。  
> 目标平台：抖音、小红书、微信公众号、微信视频号、百家号、知乎。  
> 核心链路：市场调研 → 内容策划 → 素材管理 → 图文/视频发布 → 评论/私信承接 → 客户意向评估 → 飞书/企微沉淀 → 数据复盘。  
> 当前版本：不实现真实 AI 生图/生视频，但预留未来 MediaGenerationProvider 接口。

---

## 1. 测试总目标

AI 编码工具必须做到：

1. 每个 P0 页面和按钮都有测试。
2. 每个 API 都有集成测试。
3. 每个核心状态机都有单元测试。
4. 每个 Worker 队列任务都有集成测试。
5. 每个 Provider 至少有 `sandbox / recorded / manual / disabled` 中的一种可测试实现。
6. 不允许前端使用写死 Mock 数据。
7. 前端必须调用真实后端 API。
8. 后端必须写入真实数据库。
9. 队列任务必须真实进入 Redis/BullMQ。
10. 文件必须真实进入 MinIO 或本地对象存储适配器。
11. 测试必须能在本地 Docker Compose 环境中一键执行。
12. 测试失败时，AI 必须定位原因、修复代码、重新执行测试，直到通过。

---

## 2. 测试原则

### 2.1 不使用前端 Mock 数据

禁止：

```text
前端页面写死数组数据
按钮只弹 Toast 不调用 API
表单提交不写数据库
发布任务不进入队列
线索同步不生成日志
```

允许：

```text
后端 seed 数据
sandbox provider
recorded provider
manual provider
disabled provider
真实数据库测试数据
真实 API 集成测试
```

### 2.2 Seed 数据不是 Mock 数据

Seed 数据必须写入真实数据库，用于本地开发和测试。

必须提供：

```bash
pnpm db:seed
pnpm db:reset
pnpm test
pnpm test:e2e
pnpm test:all
```

Seed 数据必须包含：

```text
品牌资料
测试用户
6 个平台测试账号
平台能力配置
素材数据
内容草稿
平台内容版本
发布任务
发布尝试记录
评论/私信/公众号消息
线索数据
飞书/企微同步配置
调研任务
调研结果
AI Skill 运行记录
Provider 运行日志
```

---

## 3. 推荐测试技术栈

### 3.1 前端

```text
Next.js App Router
Vitest
React Testing Library
Playwright
MSW 禁止用于核心业务 Mock，仅可用于异常边界测试
```

### 3.2 后端

```text
NestJS
Vitest 或 Jest
Supertest
Testcontainers 可选
Prisma
PostgreSQL 测试库
Redis 测试实例
MinIO 测试实例
```

### 3.3 E2E

```text
Playwright
真实前端服务
真实 API 服务
真实 PostgreSQL
真实 Redis
真实 MinIO
Seed 数据
Sandbox / Recorded / Manual Provider
```

### 3.4 测试报告

必须生成：

```text
coverage report
e2e html report
API test report
button acceptance matrix report
failed case summary
```

---

## 4. 测试分层

```text
Unit Test
  ↓
Integration Test
  ↓
Worker / Queue Test
  ↓
Provider Contract Test
  ↓
API Contract Test
  ↓
Frontend Component Test
  ↓
E2E Flow Test
  ↓
Button Acceptance Test
```

---

## 5. 测试目录结构

建议目录：

```text
apps/
├── web/
│   ├── app/
│   ├── components/
│   └── tests/
│       ├── unit/
│       ├── component/
│       └── e2e/
│
├── api/
│   ├── src/
│   └── tests/
│       ├── unit/
│       ├── integration/
│       ├── contract/
│       └── fixtures/
│
├── worker/
│   ├── src/
│   └── tests/
│       ├── unit/
│       └── integration/
│
├── provider-gateway/
│   ├── src/
│   └── tests/
│       ├── contract/
│       └── integration/
│
├── research-runner/
│   ├── src/
│   └── tests/
│       ├── provider/
│       └── integration/
│
└── test/
    ├── seed/
    ├── fixtures/
    ├── recorded/
    ├── helpers/
    ├── reports/
    └── acceptance/
```

---

## 6. AI 执行 TDD 工作协议

AI 每实现一个模块时，必须按以下顺序执行：

```text
1. 阅读需求和验收标准
2. 写测试用例
3. 确认测试失败
4. 实现最小功能
5. 运行测试
6. 修复失败
7. 补充边界测试
8. 运行完整相关测试
9. 生成测试报告
10. 更新任务状态
```

禁止：

```text
先写实现再补测试
删除失败测试
跳过测试
降低断言强度
使用假按钮完成测试
用 console.log 替代断言
用 TODO 跳过关键逻辑
```

---

## 7. 必须测试的核心状态机

### 7.1 PublishJob 状态机

状态：

```text
draft
scheduled
queued
publishing
waiting_human_confirm
published
failed
cancelled
```

合法流转：

```text
draft -> scheduled
draft -> queued
scheduled -> queued
queued -> publishing
publishing -> waiting_human_confirm
publishing -> published
publishing -> failed
waiting_human_confirm -> published
waiting_human_confirm -> failed
failed -> queued
scheduled -> cancelled
queued -> cancelled
```

必须测试：

```text
非法状态流转会失败
发布成功写入 PublishAttempt
发布失败写入错误原因
重试次数递增
超过最大重试进入 failed
manual_confirm 后进入 published
cancelled 任务不能再次执行
```

### 7.2 MediaAsset 审核状态机

状态：

```text
pending_review
approved
rejected
archived
```

必须测试：

```text
新上传素材默认为 pending_review
approved 素材可以用于发布
pending_review 素材不能用于发布
rejected 素材不能用于发布
archived 素材不能用于发布
未来生成素材必须先 pending_review
```

### 7.3 Interaction 处理状态机

状态：

```text
new
classified
reply_suggested
waiting_human_review
replied
converted_to_lead
ignored
```

必须测试：

```text
新互动进入 new
AI 意向识别后进入 classified
生成回复建议后进入 reply_suggested
高风险消息进入 waiting_human_review
低风险消息可进入 replied
转线索后进入 converted_to_lead
ignored 后不能自动回复
```

### 7.4 Lead 跟进状态机

状态：

```text
new
assigned
contacting
wechat_added
following
won
lost
invalid
```

必须测试：

```text
A 级线索必须支持分配负责人
同步飞书生成 LeadExternalMapping
同步企微生成 LeadExternalMapping
状态变更写入 LeadActivity
won/lost/invalid 为终态
终态线索不能继续自动修改状态
```

---

## 8. Provider Contract Test

所有 Provider 必须实现统一合同测试。

### 8.1 PublishProvider 合同

接口：

```ts
interface PublishProvider {
  getCapabilities(): Promise<PlatformCapabilities>;
  publishTextImage(input: PublishTextImageInput): Promise<PublishResult>;
  publishVideo(input: PublishVideoInput): Promise<PublishResult>;
  fetchStatus(input: FetchPublishStatusInput): Promise<PublishStatusResult>;
}
```

必须测试：

```text
getCapabilities 返回能力矩阵
不支持的能力必须返回明确错误
publishTextImage 成功返回 externalPublishId
publishVideo 成功返回 externalPublishId
失败时返回 providerErrorCode
失败时写入 ProviderRunLog
不能吞掉异常
```

### 8.2 ResearchProvider 合同

接口：

```ts
interface ResearchProvider {
  searchPosts(input: SearchPostsInput): Promise<CollectedPost[]>;
  collectPostComments(input: CollectCommentsInput): Promise<CollectedComment[]>;
  collectCreatorPosts(input: CollectCreatorInput): Promise<CollectedPost[]>;
}
```

必须测试：

```text
只允许 public_data_only
必须支持 rate limit
必须支持 maxPosts
必须支持 maxComments
失败时写入 CrawlerRunLog
连续失败触发熔断
熔断后不能继续运行
```

### 8.3 LeadSinkProvider 合同

接口：

```ts
interface LeadSinkProvider {
  testConnection(config: LeadSinkConfig): Promise<TestConnectionResult>;
  syncLead(input: SyncLeadInput): Promise<LeadSinkResult>;
  notify(input: NotifyLeadInput): Promise<NotifyResult>;
}
```

必须测试：

```text
飞书同步成功生成 externalId
企微同步成功生成 externalId
同步失败写入 LeadSinkSyncLog
重复同步不重复创建外部记录
字段映射缺失时返回明确错误
```

### 8.4 MediaGenerationProvider 预留合同

当前版本不实现真实生图/生视频，但必须测试接口边界。

接口：

```ts
interface MediaGenerationProvider {
  getCapabilities(): Promise<MediaGenerationCapabilities>;
  generateImage(input: GenerateImageInput): Promise<MediaGenerationResult>;
  generateVideo(input: GenerateVideoInput): Promise<MediaGenerationResult>;
}
```

当前必须提供：

```text
DisabledMediaGenerationProvider
MockMediaGenerationProvider
```

必须测试：

```text
DisabledProvider 调用真实生成必须失败
MockProvider 只生成 metadata，不生成真实图片/视频
生成结果必须进入 MediaAsset
生成素材默认 pending_review
未审核素材不能发布
```

---

## 9. API 集成测试要求

每个 API 必须测试：

```text
成功场景
参数校验失败
资源不存在
权限不足
状态非法
数据库写入
日志写入
幂等性
错误响应格式
```

统一错误格式：

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Publish job cannot be executed from cancelled state.",
    "details": {}
  }
}
```

---

## 10. P0 API 测试清单

### 10.1 Content API

```text
POST /api/contents
GET /api/contents
GET /api/contents/:id
PATCH /api/contents/:id
DELETE /api/contents/:id
POST /api/contents/:id/generate-variants
POST /api/contents/:id/compliance-check
```

必须验证：

```text
创建内容成功
生成 6 平台版本
平台版本内容不为空
合规检测生成结果
删除内容不能删除已发布内容
```

### 10.2 Media API

```text
POST /api/media/upload
GET /api/media
GET /api/media/:id
PATCH /api/media/:id/review
DELETE /api/media/:id
```

必须验证：

```text
文件上传进入对象存储
数据库保存 metadata
默认 pending_review
审核通过后可关联内容
未审核素材不能创建发布任务
```

### 10.3 Publish API

```text
POST /api/publish-jobs
GET /api/publish-jobs
GET /api/publish-jobs/:id
POST /api/publish-jobs/:id/execute
POST /api/publish-jobs/:id/retry
POST /api/publish-jobs/:id/cancel
POST /api/publish-jobs/:id/manual-complete
GET /api/publish-jobs/:id/logs
```

必须验证：

```text
创建发布任务成功
立即发布进入队列
Worker 执行后状态变化
失败可重试
取消后不能发布
人工完成后进入 published
```

### 10.4 Interaction / Conversation API

```text
POST /api/interactions/sync
GET /api/interactions
GET /api/conversations
GET /api/conversations/:id
POST /api/interactions/:id/classify
POST /api/interactions/:id/suggest-reply
POST /api/interactions/:id/reply
POST /api/interactions/:id/convert-to-lead
```

必须验证：

```text
同步互动入库
去重逻辑有效
AI 意向识别写入结果
回复建议可编辑
高风险消息不能自动回复
转线索成功生成 Lead
```

### 10.5 Lead API

```text
POST /api/leads
GET /api/leads
GET /api/leads/:id
PATCH /api/leads/:id/assign
PATCH /api/leads/:id/status
POST /api/leads/:id/sync-feishu
POST /api/leads/:id/sync-wecom
GET /api/leads/:id/activities
```

必须验证：

```text
线索创建成功
A/B/C/D 等级正确
分配负责人成功
同步飞书生成日志
同步企微生成日志
状态变更写入活动记录
```

### 10.6 Research API

```text
POST /api/research/tasks
GET /api/research/tasks
GET /api/research/tasks/:id
POST /api/research/tasks/:id/run
POST /api/research/tasks/:id/pause
GET /api/research/insights
GET /api/research/opportunities
POST /api/research/opportunities/:id/create-content
```

必须验证：

```text
创建调研任务成功
执行任务进入队列
MediaCrawler Provider 运行日志写入
采集结果入库
AI 洞察生成
选题机会可转内容计划
限频和熔断生效
```

### 10.7 Integration API

```text
GET /api/integrations/platforms
PATCH /api/integrations/platforms/:id
POST /api/integrations/feishu/test
PATCH /api/integrations/feishu
POST /api/integrations/wecom/test
PATCH /api/integrations/wecom
GET /api/integrations/providers
PATCH /api/integrations/providers/:id
```

必须验证：

```text
平台能力矩阵可查询
飞书连接测试成功/失败
企微连接测试成功/失败
Provider 可启用/停用
Provider 健康状态可查看
```

---

## 11. 前端按钮验收矩阵

AI 必须为每个 P0 页面生成按钮测试。

测试字段：

```text
页面
按钮
API
预期数据库变化
预期 UI 状态变化
失败提示
E2E 用例文件
```

### 11.1 Dashboard

| 按钮/操作 | 预期 |
|---|---|
| 查看今日发布任务 | 跳转 `/publish` 并带筛选 |
| 查看高意向线索 | 跳转 `/leads?level=A` |
| 查看待处理消息 | 跳转 `/conversations?status=waiting_human_review` |
| 查看平台异常 | 跳转 `/integrations/platforms` |

### 11.2 Research

| 按钮/操作 | API | 预期 |
|---|---|---|
| 新建调研任务 | `POST /api/research/tasks` | DB 新增 ResearchTask |
| 运行任务 | `POST /api/research/tasks/:id/run` | 队列新增 research.run |
| 暂停任务 | `POST /api/research/tasks/:id/pause` | 状态变为 paused |
| 生成内容计划 | `POST /api/research/opportunities/:id/create-content` | 新增 ContentItem |

### 11.3 Content

| 按钮/操作 | API | 预期 |
|---|---|---|
| 新建内容 | `POST /api/contents` | 新增 ContentItem |
| 保存草稿 | `PATCH /api/contents/:id` | 内容更新 |
| 生成平台版本 | `POST /api/contents/:id/generate-variants` | 新增 6 条 ContentVariant |
| 合规检测 | `POST /api/contents/:id/compliance-check` | 写入 SkillRun |
| 创建发布任务 | `POST /api/publish-jobs` | 新增 PublishJob |

### 11.4 Media

| 按钮/操作 | API | 预期 |
|---|---|---|
| 上传素材 | `POST /api/media/upload` | MinIO 保存文件，DB 新增 MediaAsset |
| 审核通过 | `PATCH /api/media/:id/review` | status=approved |
| 审核拒绝 | `PATCH /api/media/:id/review` | status=rejected |
| 删除素材 | `DELETE /api/media/:id` | status=archived 或删除 |

### 11.5 Publish

| 按钮/操作 | API | 预期 |
|---|---|---|
| 立即发布 | `POST /api/publish-jobs/:id/execute` | status=queued |
| 重试发布 | `POST /api/publish-jobs/:id/retry` | 新增 PublishAttempt |
| 取消发布 | `POST /api/publish-jobs/:id/cancel` | status=cancelled |
| 人工完成 | `POST /api/publish-jobs/:id/manual-complete` | status=published |
| 查看日志 | `GET /api/publish-jobs/:id/logs` | 展示日志 |

### 11.6 Conversations

| 按钮/操作 | API | 预期 |
|---|---|---|
| 同步互动 | `POST /api/interactions/sync` | 新增 Interaction |
| AI 识别 | `POST /api/interactions/:id/classify` | 写入意向等级 |
| 生成回复 | `POST /api/interactions/:id/suggest-reply` | 写入回复建议 |
| 发送回复 | `POST /api/interactions/:id/reply` | status=replied |
| 转线索 | `POST /api/interactions/:id/convert-to-lead` | 新增 Lead |

### 11.7 Leads

| 按钮/操作 | API | 预期 |
|---|---|---|
| 分配负责人 | `PATCH /api/leads/:id/assign` | ownerId 更新 |
| 更新状态 | `PATCH /api/leads/:id/status` | LeadActivity 新增 |
| 同步飞书 | `POST /api/leads/:id/sync-feishu` | LeadExternalMapping 新增 |
| 同步企微 | `POST /api/leads/:id/sync-wecom` | LeadExternalMapping 新增 |

### 11.8 Integrations

| 按钮/操作 | API | 预期 |
|---|---|---|
| 测试飞书连接 | `POST /api/integrations/feishu/test` | 展示成功/失败 |
| 保存飞书配置 | `PATCH /api/integrations/feishu` | 配置加密保存 |
| 测试企微连接 | `POST /api/integrations/wecom/test` | 展示成功/失败 |
| 启用 Provider | `PATCH /api/integrations/providers/:id` | Provider 状态更新 |

---

## 12. E2E 主流程测试

### 12.1 Flow A：调研到内容

```text
登录系统
进入 Research
新建小红书关键词调研任务
运行任务
等待任务完成
查看调研洞察
选择一个选题机会
点击生成内容
进入内容详情页
断言 ContentItem 已创建
```

### 12.2 Flow B：内容到发布

```text
进入 Content
新建视频内容
上传视频素材
审核通过素材
生成 6 平台版本
创建 6 个发布任务
执行其中一个 manual provider 发布任务
标记人工完成
断言 PublishJob 状态为 published
```

### 12.3 Flow C：评论到线索

```text
进入 Conversations
点击同步互动
选择一条评论
点击 AI 识别
点击生成回复建议
点击转线索
进入 Leads
断言新线索出现
断言线索等级正确
```

### 12.4 Flow D：线索沉淀飞书/企微

```text
进入 Leads
打开 A 级线索
点击同步飞书
断言同步日志 success 或 sandbox_success
点击同步企微
断言同步日志 success 或 sandbox_success
```

### 12.5 Flow E：复盘看板

```text
完成发布和线索流程
进入 Analytics
断言发布数量、互动数量、线索数量不为 0
点击内容分析
断言能看到内容获客排行
```

---

## 13. 测试数据规范

### 13.1 Seed 平台账号

必须包含：

```text
douyin_test_account
xiaohongshu_test_account
wechat_official_test_account
wechat_channels_test_account
baijiahao_test_account
zhihu_test_account
```

每个账号必须包含：

```text
platform
displayName
mode
capabilities
status
lastSyncAt
```

### 13.2 Seed 内容

必须包含：

```text
图文内容 2 条
视频内容 2 条
公众号文章 1 条
知乎回答 1 条
百家号文章 1 条
```

### 13.3 Seed 互动

必须包含：

```text
价格咨询评论
预约咨询私信
普通互动评论
投诉/高风险评论
无效广告评论
公众号消息
```

### 13.4 Seed 线索

必须包含：

```text
A 级线索
B 级线索
C 级线索
D 无效线索
已同步飞书线索
已同步企微线索
```

---

## 14. 覆盖率要求

最低要求：

```text
核心业务单元测试覆盖率 >= 80%
API 集成测试覆盖 P0 API 100%
P0 页面 E2E 覆盖率 100%
P0 页面按钮覆盖率 100%
状态机测试覆盖率 100%
Provider Contract 测试覆盖率 100%
```

---

## 15. CI 验证命令

AI 必须生成以下命令：

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:coverage
pnpm test:all
```

推荐：

```bash
pnpm dev:up
pnpm dev:down
pnpm db:reset
pnpm db:seed
pnpm test:acceptance
pnpm test:providers
```

---

## 16. CI 通过标准

CI 必须通过：

```text
Lint 通过
Typecheck 通过
Unit Test 通过
Integration Test 通过
Provider Contract Test 通过
E2E Test 通过
Coverage 达标
无 skipped 核心测试
无 only 测试
无 TODO 核心断言
```

禁止合并：

```text
测试失败
覆盖率不足
核心按钮无测试
Provider 无合同测试
状态机无测试
E2E 主流程不通
```

---

## 17. AI 自测报告模板

每完成一个阶段，AI 必须输出：

```markdown
# 测试验证报告

## 本次实现模块
- 模块名称：
- 涉及页面：
- 涉及 API：
- 涉及数据库表：
- 涉及队列任务：

## 新增测试
- Unit：
- Integration：
- E2E：
- Provider Contract：
- Button Acceptance：

## 测试命令
```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

## 测试结果
- Lint：
- Typecheck：
- Unit：
- Integration：
- E2E：
- Coverage：

## 失败与修复
- 失败用例：
- 原因：
- 修复方式：
- 重新验证结果：

## 未覆盖风险
- 风险 1：
- 风险 2：

## 是否满足验收
- 是 / 否
```

---

## 18. Codex / Claude Code 测试生成 Prompt

可直接复制给 AI 编码工具：

```text
你现在是本项目的测试工程师和 TDD 执行者。

项目是 AI 全域内容获客运营系统，单品牌自用，支持抖音、小红书、微信公众号、微信视频号、百家号、知乎。系统包含 Research、Content、Media、Publish、Conversations、Leads、Analytics、Integrations、Settings 等模块。

请严格按照以下规则执行：

1. 不允许使用前端 Mock 数据。
2. 所有前端按钮必须调用真实 API。
3. API 必须写入真实 PostgreSQL 测试库。
4. 队列任务必须进入 Redis/BullMQ。
5. 文件上传必须进入 MinIO 或测试对象存储。
6. 外部平台不可控时，使用 sandbox / recorded / manual / disabled provider，不要使用前端假数据。
7. 先写测试，再写实现。
8. 每个 P0 页面按钮必须有 E2E 测试。
9. 每个 P0 API 必须有集成测试。
10. 每个状态机必须有单元测试。
11. 每个 Provider 必须有合同测试。
12. 测试失败时，不要删除测试，要修复实现。
13. 最终输出测试验证报告。

请先读取 docs/AI_Testing_Spec.md，然后：
- 生成测试目录结构
- 生成 seed 数据
- 生成 Provider Contract 测试
- 生成 API 集成测试
- 生成 P0 E2E 测试
- 运行测试
- 修复失败
- 输出测试报告
```

---

## 19. 第一阶段优先测试顺序

AI 不要一次性写完全部测试，建议按阶段：

```text
Stage 1：数据库 seed + 基础状态机测试
Stage 2：Content / Media API 测试
Stage 3：PublishJob 状态机 + Publish API 测试
Stage 4：Provider Contract 测试
Stage 5：Interaction / Lead API 测试
Stage 6：Feishu / WeCom Sink 测试
Stage 7：Research Ops 测试
Stage 8：前端 P0 页面 E2E 测试
Stage 9：按钮验收矩阵测试
Stage 10：完整主链路测试
```

---

## 20. 最终验收标准

本测试 Spec 的最终验收标准：

```text
1. 本地 Docker Compose 可启动完整系统。
2. pnpm db:seed 可生成完整测试数据。
3. 前端无写死 Mock 数据。
4. P0 页面所有按钮可真实调用 API。
5. P0 API 100% 有集成测试。
6. 所有核心状态机有单元测试。
7. Provider 有合同测试。
8. 5 条 E2E 主流程全部通过。
9. 飞书/企微同步至少 sandbox/recorded 模式通过。
10. Research Ops 至少 manual/recorded/real_crawler 一种模式通过。
11. 发布任务至少 manual/sandbox/recorded 一种模式通过。
12. 测试报告自动生成。
```

---

## 21. 一句话总结

本项目测试策略不是“页面能看”，而是：

```text
页面按钮真实调用 API
API 真实写数据库
任务真实进队列
Provider 真实执行可控模式
状态真实流转
日志真实记录
测试真实验证
```

AI 编码工具必须围绕这个目标进行测试用例编写、功能实现、验证和修复。
