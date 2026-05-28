# AI 全域内容获客运营系统｜评论/私信拉取与回复 Spec v1.0

> 本文档用于指导 AI 编码工具（Codex / Claude Code / Cursor）实现「从平台拉取评论/私信」与「向平台发送回复」能力。  
> 适用系统：单品牌自用的 AI 全域内容获客运营系统。  
> 涉及平台：抖音、小红书、微信公众号、微信视频号、百家号、知乎。  
> 设计原则：官方 API 优先，Browser Assist 兜底，人工确认保障，AI 只做意向识别与回复建议，高风险动作必须人工接管。

---

## 1. 背景与目标

### 1.1 业务背景

本系统需要帮助品牌方统一承接多个内容平台的用户互动，包括：

- 用户评论
- 用户私信
- 公众号消息
- 线索表单
- 评论回复
- 私信回复
- 回复后的线索沉淀
- 飞书/企微跟进

客户希望通过评论和私信获客，所以系统必须支持：

```text
平台互动数据同步
→ AI 判断客户意向
→ AI 生成回复建议
→ 自动或人工回复
→ 高意向线索沉淀飞书/企微
→ 内容获客效果复盘
```

### 1.2 设计目标

本模块目标：

1. 支持 6 个平台互动数据统一入库。
2. 支持评论、私信、公众号消息等多类型 Interaction。
3. 支持 AI 自动识别客户意向。
4. 支持 AI 生成回复建议。
5. 支持低风险自动回复。
6. 支持中高风险人工确认。
7. 支持回复日志和审计。
8. 支持互动转线索。
9. 支持飞书/企微沉淀。
10. 支持官方 API、Webhook、Browser Assist、Manual Import、Recorded/Sandbox 多种运行模式。
11. 禁止将 MediaCrawler 用于私信采集或自动回复。
12. 禁止绕过平台风控、验证码或采集非公开信息。

---

## 2. 范围定义

### 2.1 本模块包含

| 能力 | 是否包含 |
|---|---|
| 自有账号评论同步 | 包含 |
| 自有账号私信/消息同步 | 包含，按平台能力分级 |
| 公众号消息接收 | 包含 |
| 评论回复 | 包含，按平台能力分级 |
| 私信/消息回复 | 包含，按平台能力分级 |
| AI 意向识别 | 包含 |
| AI 回复建议 | 包含 |
| 自动回复策略 | 包含 |
| 人工确认回复 | 包含 |
| 互动转线索 | 包含 |
| 飞书/企微线索沉淀 | 包含 |
| 回复日志/审计 | 包含 |
| Provider Contract Test | 包含 |

### 2.2 本模块不包含

| 能力 | 是否包含 |
|---|---|
| 大规模采集非自有账号私信 | 不包含 |
| 绕过验证码/风控 | 不包含 |
| 自动批量骚扰用户 | 不包含 |
| MediaCrawler 拉取私信 | 不包含 |
| 对用户主动批量私信营销 | 不包含 |
| 所有平台全自动回复承诺 | 不包含 |
| 生图/生视频 | 不包含，仅未来预留在其他模块 |

---

## 3. 平台可行性矩阵

| 平台 | 评论拉取 | 私信/消息拉取 | 评论回复 | 私信/消息回复 | 推荐实现 |
|---|---:|---:|---:|---:|---|
| 抖音 | 高 | 中，依赖权限 | 高 | 中，依赖权限 | Official API 优先 |
| 小红书 | 中 | 中，依赖聚光/企业号/服务商 | 中 | 中，默认人工确认 | 聚光线索 + Browser Assist |
| 微信公众号 | 高 | 高 | 不适用，主要消息回复 | 高，受规则限制 | 官方开发者模式 |
| 微信视频号 | 中低 | 中低 | 中低 | 中低 | Browser Assist + Manual |
| 百家号 | 中 | 中低 | 中低 | 中低 | 内容分发为主，互动弱化 |
| 知乎 | 中 | 低 | 中低 | 低 | 调研 + 半自动处理 |

---

## 4. 平台接入策略

### 4.1 抖音

#### 推荐模式

```text
评论拉取：official_api
评论回复：official_api
私信同步：official_api / browser_assist / manual_import
私信回复：默认人工确认
```

#### P0 能力

- 拉取自有视频评论
- 拉取评论回复
- AI 判断评论意向
- 生成回复建议
- 低风险评论自动回复
- 高风险评论人工确认
- 评论转线索

#### P1 能力

- 私信同步
- 私信回复
- 企业号 IM 能力
- 私信转企微

#### 降级策略

| 场景 | 降级 |
|---|---|
| 没有评论权限 | Manual Import |
| 评论回复失败 | 进入人工确认队列 |
| 私信权限不足 | 只支持手动录入线索 |
| 接口限流 | 暂停同步，写入 SyncJob 失败原因 |

---

### 4.2 小红书

#### 推荐模式

```text
公开评论调研：MediaCrawler Research，仅低频公开数据
自有评论同步：official/service provider/browser_assist
私信线索：聚光线索/企业号/数据推送
评论回复：browser_assist + human_review
私信回复：human_review 默认
```

#### P0 能力

- 小红书线索/私信线索入库
- 评论/私信人工确认回复
- 高意向线索同步飞书/企微
- 小红书评论洞察用于内容优化

#### 不建议第一版承诺

- 全自动私信回复
- 全自动高频评论回复
- 非官方私信采集

---

### 4.3 微信公众号

#### 推荐模式

```text
消息接收：webhook
被动回复：official_api
客服消息：official_api，受时间窗口限制
```

#### P0 能力

- 接收用户文本消息
- 接收图片/语音/链接等消息 metadata
- AI 意向识别
- FAQ 低风险自动回复
- 高意向客户转线索
- 引导企微/表单/人工客服
- 回复日志审计

#### 注意事项

- 自动回复必须遵守公众号消息机制。
- 客服消息需要在平台允许的时间窗口内发送。
- 超出窗口进入人工处理或下次用户互动后再回复。

---

### 4.4 微信视频号

#### 推荐模式

```text
评论/私信：browser_assist / manual_import
回复：human_review
```

#### P0 能力

- 手动导入或 Browser Assist 同步评论
- AI 判断意向
- 生成回复建议
- 人工确认回复
- 转线索

#### 不建议第一版承诺

- 完全自动私信读取
- 完全自动私信回复
- 高频自动互动

---

### 4.5 百家号

#### 推荐模式

```text
评论/粉丝消息：能接则接，不能接 Manual
回复：human_review
```

#### P0 能力

- 支持评论/消息手动导入
- 支持 AI 意向识别
- 支持回复建议
- 支持转线索
- 内容复盘优先于互动自动化

---

### 4.6 知乎

#### 推荐模式

```text
问题/回答/评论调研：MediaCrawler Research
自有内容评论处理：browser_assist / manual_import
私信：不作为 P0 主链路
```

#### P0 能力

- 评论导入
- AI 意向识别
- 回复建议
- 人工确认
- 转线索

#### 不建议第一版承诺

- 私信自动拉取
- 私信自动回复
- 批量评论互动

---

## 5. 统一模块架构

### 5.1 模块名称

```text
Interaction Ops
```

### 5.2 业务链路

```text
平台评论/私信/公众号消息
→ Interaction Connector
→ Interaction Normalizer
→ Interaction Store
→ Lead Scoring Agent
→ Reply Suggestion Agent
→ Reply Policy Engine
→ Auto Reply / Human Review
→ Lead Conversion
→ Feishu / WeCom Sink
→ Analytics
```

### 5.3 模块职责

| 模块 | 职责 |
|---|---|
| Interaction Connector | 从平台拉取或接收互动数据 |
| Interaction Normalizer | 统一不同平台数据结构 |
| Interaction Store | 存储 Interaction / Conversation |
| Lead Scoring Agent | 评估客户意向 |
| Reply Suggestion Agent | 生成回复建议 |
| Reply Policy Engine | 判断是否可自动回复 |
| Reply Executor | 执行发送回复 |
| Human Review Queue | 人工确认队列 |
| Lead Converter | 互动转线索 |
| Lead Sink | 同步飞书/企微 |
| Audit Logger | 记录审计日志 |

---

## 6. Interaction Connector 设计

### 6.1 统一接口

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

### 6.2 能力声明

```ts
export type InteractionCapabilities = {
  platform: PlatformCode;

  fetchComments: boolean | "limited";
  fetchMessages: boolean | "limited";
  replyComments: boolean | "limited";
  replyMessages: boolean | "limited";

  webhookSupported: boolean;
  pollingSupported: boolean;
  browserAssistSupported: boolean;
  manualImportSupported: boolean;

  autoReplyAllowed: boolean | "low_risk_only";
  requiresHumanReviewForMessageReply: boolean;
  requiresHumanReviewForLeadLevelA: boolean;

  supportedModes: InteractionMode[];
};

export type InteractionMode =
  | "official_api"
  | "webhook"
  | "browser_assist"
  | "manual_import"
  | "recorded"
  | "sandbox"
  | "disabled";
```

### 6.3 Provider 选择规则

```ts
function selectInteractionMode(platform, capability, accountConfig) {
  if (accountConfig.officialApiEnabled && capability.supportsOfficialApi) return "official_api";
  if (accountConfig.webhookEnabled && capability.webhookSupported) return "webhook";
  if (accountConfig.browserAssistEnabled && capability.browserAssistSupported) return "browser_assist";
  if (accountConfig.manualImportEnabled) return "manual_import";
  if (process.env.NODE_ENV === "test") return "recorded";
  return "disabled";
}
```

---

## 7. 数据模型设计

### 7.1 PlatformAccount 补充字段

```prisma
model PlatformAccount {
  id              String   @id @default(cuid())
  platform        String
  displayName     String
  authMode        String
  interactionMode String
  status          String
  capabilities    Json
  lastSyncAt      DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

---

### 7.2 Interaction

```prisma
model Interaction {
  id                    String   @id @default(cuid())
  platform              String
  platformAccountId     String
  externalInteractionId String
  externalUserId        String?
  userNickname          String?
  type                  String
  content               String
  rawPayload            Json?
  sourceContentId       String?
  sourcePublishJobId    String?
  status                String
  receivedAt            DateTime
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  classification        InteractionClassification?
  replySuggestions      ReplySuggestion[]
  leadId                String?

  @@unique([platform, platformAccountId, externalInteractionId])
  @@index([platform, status])
  @@index([platformAccountId, receivedAt])
}
```

Interaction 类型：

```text
comment
comment_reply
private_message
official_account_message
lead_form
system_message
manual_import
```

Interaction 状态：

```text
new
classified
reply_suggested
waiting_human_review
replied
converted_to_lead
ignored
failed
```

---

### 7.3 Conversation

```prisma
model Conversation {
  id                String   @id @default(cuid())
  platform          String
  platformAccountId String
  externalUserId    String?
  userNickname      String?
  leadId            String?
  status            String
  lastMessageAt     DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([platform, externalUserId])
}
```

---

### 7.4 InteractionClassification

```prisma
model InteractionClassification {
  id             String   @id @default(cuid())
  interactionId  String   @unique
  intent         String
  leadLevel      String
  confidence     Float
  riskLevel      String
  summary        String
  tags           Json
  nextAction     String
  modelProvider  String?
  modelName      String?
  createdAt      DateTime @default(now())
}
```

Intent 枚举建议：

```text
price_inquiry
appointment_request
location_inquiry
case_request
cooperation_inquiry
product_inquiry
complaint
after_sales
spam
general_chat
unknown
```

LeadLevel：

```text
A
B
C
D
```

RiskLevel：

```text
low
medium
high
```

---

### 7.5 ReplySuggestion

```prisma
model ReplySuggestion {
  id             String   @id @default(cuid())
  interactionId  String
  suggestedText  String
  replyType      String
  riskLevel      String
  needReview     Boolean
  decision       String
  decisionReason String
  status         String
  reviewedBy     String?
  reviewedAt     DateTime?
  sentAt         DateTime?
  createdAt      DateTime @default(now())
}
```

ReplySuggestion 状态：

```text
draft
waiting_review
approved
rejected
sent
failed
cancelled
```

ReplyType：

```text
faq_answer
guide_to_private
guide_to_wecom
ask_more_info
thanks
complaint_response
manual_only
```

---

### 7.6 ReplyAttempt

```prisma
model ReplyAttempt {
  id                String   @id @default(cuid())
  replySuggestionId String
  platform          String
  providerMode      String
  status            String
  externalReplyId   String?
  errorCode         String?
  errorMessage      String?
  rawResponse       Json?
  createdAt         DateTime @default(now())

  @@index([platform, status])
}
```

---

### 7.7 InteractionSyncJob

```prisma
model InteractionSyncJob {
  id                String   @id @default(cuid())
  platform          String
  platformAccountId String
  syncType          String
  mode              String
  status            String
  cursor            String?
  startedAt         DateTime?
  finishedAt        DateTime?
  fetchedCount      Int      @default(0)
  errorMessage      String?
  createdAt         DateTime @default(now())

  @@index([platform, status])
}
```

SyncType：

```text
comments
messages
lead_forms
all
```

---

## 8. 状态机设计

### 8.1 Interaction 状态机

```text
new
→ classified
→ reply_suggested
→ waiting_human_review
→ replied
→ converted_to_lead
```

其他流转：

```text
new → ignored
classified → converted_to_lead
reply_suggested → replied
reply_suggested → waiting_human_review
waiting_human_review → replied
waiting_human_review → ignored
```

非法规则：

```text
ignored 不能自动回复
replied 不能重复发送相同回复
converted_to_lead 不能重复创建线索
failed 可重新处理
```

---

### 8.2 ReplySuggestion 状态机

```text
draft
→ waiting_review
→ approved
→ sent
```

其他流转：

```text
draft → sent
waiting_review → rejected
approved → failed
failed → waiting_review
```

规则：

```text
needReview=true 时不能 draft → sent
riskLevel=high 时必须 waiting_review
leadLevel=A 时默认 waiting_review
平台不支持 autoReply 时必须 waiting_review
```

---

### 8.3 InteractionSyncJob 状态机

```text
queued
→ running
→ success
```

其他流转：

```text
running → failed
failed → queued
running → cancelled
```

规则：

```text
同一平台同一账号同一 syncType 同时只能有一个 running
连续失败超过阈值进入 provider_suspended
```

---

## 9. API 设计

### 9.1 创建互动同步任务

```http
POST /api/interactions/sync
```

请求：

```json
{
  "platform": "douyin",
  "platformAccountId": "acc_001",
  "syncType": "comments",
  "sourceContentId": "content_001"
}
```

响应：

```json
{
  "jobId": "sync_job_001",
  "status": "queued"
}
```

---

### 9.2 查询互动列表

```http
GET /api/interactions
```

查询参数：

```text
platform
platformAccountId
type
status
leadLevel
riskLevel
keyword
sourceContentId
page
pageSize
```

---

### 9.3 查询会话列表

```http
GET /api/conversations
```

---

### 9.4 查询会话详情

```http
GET /api/conversations/:id
```

---

### 9.5 AI 意向识别

```http
POST /api/interactions/:id/classify
```

响应：

```json
{
  "interactionId": "int_001",
  "intent": "price_inquiry",
  "leadLevel": "A",
  "confidence": 0.91,
  "riskLevel": "low",
  "summary": "用户咨询价格和预约方式",
  "tags": ["价格咨询", "高意向"],
  "nextAction": "notify_sales"
}
```

---

### 9.6 生成回复建议

```http
POST /api/interactions/:id/suggest-reply
```

响应：

```json
{
  "replySuggestionId": "reply_001",
  "suggestedText": "您好，具体价格会根据您的需求有所不同，可以私信我了解详细方案。",
  "riskLevel": "low",
  "needReview": false,
  "decision": "auto_send_allowed",
  "decisionReason": "普通价格咨询，未命中敏感规则"
}
```

---

### 9.7 发送回复

```http
POST /api/interactions/:id/reply
```

请求：

```json
{
  "replySuggestionId": "reply_001",
  "finalText": "您好，可以私信我了解详细方案。",
  "sendMode": "auto_send"
}
```

响应：

```json
{
  "status": "sent",
  "externalReplyId": "external_reply_123"
}
```

被阻止时：

```json
{
  "status": "blocked",
  "reason": "当前回复涉及导流，需要人工确认"
}
```

---

### 9.8 人工审核回复

```http
POST /api/reply-suggestions/:id/review
```

请求：

```json
{
  "action": "approve",
  "finalText": "您好，可以先了解一下您的需求，我这边安排同事跟进。"
}
```

---

### 9.9 转线索

```http
POST /api/interactions/:id/convert-to-lead
```

响应：

```json
{
  "leadId": "lead_001",
  "leadLevel": "A",
  "status": "new"
}
```

---

### 9.10 忽略互动

```http
POST /api/interactions/:id/ignore
```

---

### 9.11 查询回复日志

```http
GET /api/interactions/:id/reply-attempts
```

---

## 10. 队列任务设计

### 10.1 队列名称

```text
interaction.sync.comments
interaction.sync.messages
interaction.classify
interaction.suggest_reply
interaction.send_reply
interaction.convert_to_lead
lead.sync.feishu
lead.sync.wecom
```

### 10.2 任务流程

```text
sync task
→ connector.fetch
→ normalizer.normalize
→ dedupe
→ store interaction
→ enqueue classify
→ enqueue suggest_reply
→ policy decision
→ auto_send or waiting_review
→ convert_to_lead if leadLevel A/B
```

### 10.3 失败处理

| 失败类型 | 处理 |
|---|---|
| 平台鉴权失败 | 标记账号异常 |
| 接口限流 | 延迟重试 |
| Provider 不支持 | 降级 manual |
| AI 分类失败 | 状态 failed，可重试 |
| 回复发送失败 | 写 ReplyAttempt failed |
| 重复互动 | 忽略，更新 receivedAt |
| 连续失败 | 熔断 Provider |

---

## 11. AI Skill 设计

### 11.1 Lead Scoring Skill

输入：

```json
{
  "platform": "douyin",
  "interactionType": "comment",
  "content": "多少钱？可以预约吗？",
  "sourceContentTitle": "企业 AI 获客系统案例",
  "brandProfile": {},
  "conversationHistory": []
}
```

输出：

```json
{
  "intent": "price_inquiry",
  "leadLevel": "A",
  "confidence": 0.91,
  "riskLevel": "low",
  "summary": "用户咨询价格并提到预约，属于高意向线索",
  "tags": ["价格咨询", "预约咨询", "高意向"],
  "nextAction": "notify_sales"
}
```

### 11.2 Reply Suggestion Skill

输入：

```json
{
  "interaction": {},
  "classification": {},
  "brandTone": "专业、克制、不过度承诺",
  "platformRules": {}
}
```

输出：

```json
{
  "suggestedText": "您好，具体方案会根据您的业务情况来定，可以先私信我，我发您案例和流程参考。",
  "replyType": "guide_to_private",
  "riskLevel": "low",
  "needReview": false,
  "reason": "普通咨询引导，未涉及敏感承诺"
}
```

### 11.3 Risk Check Skill

规则：

```text
检测敏感词
检测站外导流
检测夸大承诺
检测高风险行业表达
检测手机号/微信号
检测平台禁用词
检测投诉/差评
检测 AI 置信度不足
```

---

## 12. Reply Policy Engine

### 12.1 输入

```ts
type ReplyPolicyInput = {
  platform: PlatformCode;
  interactionType: InteractionType;
  leadLevel: "A" | "B" | "C" | "D";
  confidence: number;
  riskLevel: "low" | "medium" | "high";
  suggestedText: string;
  connectorCapabilities: InteractionCapabilities;
  autoReplyConfig: AutoReplyConfig;
};
```

### 12.2 输出

```ts
type ReplyDecision = {
  action: "auto_send" | "require_human_review" | "blocked" | "manual_only";
  reason: string;
  riskLevel: "low" | "medium" | "high";
};
```

### 12.3 默认规则

```text
1. 平台不支持 replyComments/replyMessages → manual_only
2. riskLevel=high → require_human_review
3. leadLevel=A → require_human_review
4. confidence < 0.75 → require_human_review
5. suggestedText 包含手机号/微信号/外链 → require_human_review
6. 投诉/差评 → require_human_review
7. autoReplyConfig.enabled=false → require_human_review
8. interactionType=private_message 默认 require_human_review
9. 普通 FAQ + low risk + confidence>=0.85 → auto_send
10. D 级无效线索 → blocked 或 ignored
```

---

## 13. 前端页面设计

### 13.1 统一收件箱

路径：

```text
/conversations
```

筛选项：

```text
平台
账号
消息类型
线索等级
风险等级
处理状态
是否待人工
来源内容
关键词
```

列表字段：

```text
用户昵称
平台
类型
内容摘要
AI 意向
风险等级
状态
来源内容
收到时间
操作
```

操作按钮：

```text
查看详情
AI 识别
生成回复
发送回复
转线索
忽略
```

---

### 13.2 会话详情

路径：

```text
/conversations/[id]
```

布局：

```text
左侧：会话消息流
中间：回复编辑器
右侧：AI 意向识别、回复建议、来源内容、用户信息
底部：操作日志
```

按钮：

```text
AI 意向识别
生成回复建议
采纳回复
编辑后发送
转人工
转线索
同步飞书
同步企微
忽略
```

---

### 13.3 人工确认队列

路径：

```text
/conversations/review
```

展示：

```text
高风险回复
导流相关回复
AI 低置信度回复
A 级线索回复
平台不支持自动回复的回复
```

操作：

```text
通过并发送
编辑后发送
拒绝
转人工跟进
转线索
```

---

### 13.4 同步任务页面

路径：

```text
/conversations/sync-jobs
```

展示：

```text
平台
账号
同步类型
运行模式
状态
拉取数量
错误信息
开始时间
结束时间
操作
```

操作：

```text
重新运行
暂停账号同步
查看日志
```

---

## 14. 权限设计

角色：

| 角色 | 权限 |
|---|---|
| Admin | 所有配置、同步、回复、自动回复规则 |
| Operator | 查看互动、生成回复、人工审核、转线索 |
| Sales | 查看线索、跟进、回复已分配线索 |
| Viewer | 只读 |

权限规则：

```text
只有 Admin 可开启自动回复。
只有 Admin 可配置平台账号。
Operator 可审核回复。
Sales 可处理已分配线索。
Viewer 不能发送回复。
```

---

## 15. 安全与合规

### 15.1 数据安全

```text
私信和评论原文必须入库，但敏感信息要标记。
Token 加密存储。
日志不得记录明文 Token。
回复内容必须保留审计记录。
删除账号时要支持停止同步。
```

### 15.2 平台安全

```text
禁止绕过验证码。
禁止模拟高频骚扰。
禁止非公开数据采集。
禁止使用 MediaCrawler 拉取私信。
禁止自动批量私信。
```

### 15.3 自动回复安全

```text
自动回复默认关闭。
评论自动回复可按平台开启。
私信自动回复默认关闭。
高意向线索默认人工确认。
导流相关内容默认人工确认。
```

---

## 16. 测试方案

### 16.1 单元测试

必须测试：

```text
Interaction 状态机
ReplySuggestion 状态机
Reply Policy Engine
Lead Scoring 输出 Schema 校验
Risk Check 规则
Interaction Normalizer
Provider Mode Selector
```

### 16.2 集成测试

必须测试：

```text
同步评论入库
同步私信入库
去重逻辑
AI 意向识别写入
回复建议写入
发送回复写 ReplyAttempt
转线索生成 Lead
飞书/企微同步触发
```

### 16.3 Provider Contract Test

每个平台 Connector 必须测试：

```text
getCapabilities 返回能力矩阵
不支持能力返回明确错误
fetchComments 可返回标准结构
fetchMessages 可返回标准结构或 unsupported
replyComment 可成功/失败
replyMessage 可成功/失败/unsupported
失败写 ProviderRunLog
```

### 16.4 E2E 测试

主流程：

```text
同步评论
→ 查看统一收件箱
→ AI 意向识别
→ 生成回复建议
→ Reply Policy 判断
→ 低风险发送 / 高风险人工确认
→ 转线索
→ 同步飞书/企微
```

### 16.5 必须验收场景

| 场景 | 验收标准 |
|---|---|
| 抖音评论同步 | Interaction 入库，去重生效 |
| 抖音评论回复 | ReplyAttempt success 或明确失败 |
| 公众号消息接收 | Webhook 入库 |
| 公众号消息回复 | 回复成功或超时窗口提示 |
| 小红书线索导入 | 生成 Interaction/Lead |
| 视频号人工处理 | Manual 流程可完成 |
| 知乎评论导入 | 可识别意向并转线索 |
| 高风险回复 | 必须进入人工确认 |
| A 级线索 | 必须同步飞书/企微或生成待同步任务 |

---

## 17. 开发计划

### Stage 1：基础模型与状态机

- Interaction
- Conversation
- InteractionClassification
- ReplySuggestion
- ReplyAttempt
- InteractionSyncJob
- 状态机测试

### Stage 2：统一 API

- 互动同步 API
- 互动列表 API
- 会话详情 API
- AI 分类 API
- 回复建议 API
- 发送回复 API
- 转线索 API

### Stage 3：Reply Policy Engine

- 自动回复规则
- 人工确认规则
- 敏感词/导流规则
- 平台能力判断

### Stage 4：Provider Contract

- BaseInteractionConnector
- Mock/Recorded/Sandbox Connector
- Douyin Connector skeleton
- Wechat Official Connector skeleton
- Manual Import Connector

### Stage 5：前端页面

- 统一收件箱
- 会话详情
- 人工确认队列
- 同步任务页面

### Stage 6：飞书/企微闭环

- A/B 级线索同步
- 飞书提醒
- 企微承接
- 同步日志

### Stage 7：E2E 验收

- 评论同步到回复
- 消息同步到线索
- 高风险人工确认
- 飞书/企微沉淀

---

## 18. AI 代码生成要求

AI 编码工具必须遵守：

```text
1. 先写测试，再写实现。
2. 所有 API 必须有集成测试。
3. 所有状态机必须有单元测试。
4. 所有 Provider 必须有 Contract Test。
5. 不允许前端 Mock 数据。
6. 前端按钮必须调用真实 API。
7. 外部平台不可用时使用 recorded/sandbox/manual，不写死假数据。
8. 高风险回复必须人工确认。
9. MediaCrawler 不得用于私信。
10. 回复动作必须写 ReplyAttempt 和 AuditLog。
```

---

## 19. Codex / Claude Code 执行 Prompt

```text
你现在负责实现 AI 全域内容获客运营系统中的 Interaction Ops 模块，包括评论/私信拉取、AI 意向识别、回复建议、自动/人工回复、互动转线索。

请严格读取 docs/interaction_reply_spec.md，并按 TDD 执行：

1. 创建数据库模型：
   - Interaction
   - Conversation
   - InteractionClassification
   - ReplySuggestion
   - ReplyAttempt
   - InteractionSyncJob

2. 编写状态机单元测试：
   - Interaction 状态机
   - ReplySuggestion 状态机
   - InteractionSyncJob 状态机

3. 实现 API：
   - POST /api/interactions/sync
   - GET /api/interactions
   - GET /api/conversations
   - GET /api/conversations/:id
   - POST /api/interactions/:id/classify
   - POST /api/interactions/:id/suggest-reply
   - POST /api/interactions/:id/reply
   - POST /api/interactions/:id/convert-to-lead
   - POST /api/interactions/:id/ignore
   - GET /api/interactions/:id/reply-attempts

4. 实现 Reply Policy Engine：
   - 低风险可自动回复
   - 高风险必须人工确认
   - A 级线索必须人工确认
   - 私信默认人工确认
   - 不支持回复的平台进入 manual_only

5. 实现 Provider Contract：
   - InteractionConnector
   - RecordedInteractionConnector
   - ManualInteractionConnector
   - DisabledInteractionConnector
   - DouyinInteractionConnector skeleton
   - WechatOfficialInteractionConnector skeleton

6. 实现前端页面：
   - /conversations
   - /conversations/[id]
   - /conversations/review
   - /conversations/sync-jobs

7. 编写 E2E 测试：
   - 同步评论
   - AI 识别
   - 生成回复
   - 人工确认
   - 转线索
   - 同步飞书/企微

禁止：
- 使用前端 Mock 数据
- 删除失败测试
- 跳过核心断言
- 使用 MediaCrawler 拉取私信
- 默认全自动私信回复

最终输出测试验证报告。
```

---

## 20. 最终验收标准

本模块完成后必须满足：

```text
1. 可以创建互动同步任务。
2. 可以将平台评论/消息统一入库。
3. 可以去重。
4. 可以在统一收件箱查看互动。
5. 可以 AI 判断客户意向。
6. 可以生成回复建议。
7. 可以按规则判断自动回复或人工确认。
8. 可以发送低风险回复。
9. 可以阻止高风险回复。
10. 可以将互动转线索。
11. A/B 级线索可以同步飞书/企微。
12. 所有回复动作有 ReplyAttempt。
13. 所有关键动作有 AuditLog。
14. 所有 P0 API 有测试。
15. P0 页面按钮真实调用 API。
16. E2E 主流程通过。
```

---

## 21. 一句话总结

本模块不是简单“自动回复机器人”，而是：

```text
统一拉取互动
→ AI 判断客户意向
→ AI 生成回复建议
→ 策略引擎控制风险
→ 低风险自动回复
→ 高风险人工确认
→ 高意向客户沉淀飞书/企微
```

系统必须优先保证稳定、可控、可审计、可降级，而不是追求所有平台全自动化。
