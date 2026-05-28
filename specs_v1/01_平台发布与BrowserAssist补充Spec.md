# 平台发布与 Browser Assist 补充 Spec v1.0

> 解决问题：之前 Spec 里已有“多平台图文/视频发布”概念，但缺少足够细的发布 Provider、状态机、人工确认、日志、失败重试和 Browser Assist 工程设计。

---

## 1. 模块目标

支持抖音、小红书、微信公众号、微信视频号、百家号、知乎的图文/视频/文章/问答发布任务管理。

核心目标：

```text
内容版本 → 发布任务 → Provider 选择 → 执行发布 → 状态回写 → 日志审计 → 失败重试/人工兜底
```

---

## 2. 发布能力分级

| 模式 | 含义 | 适用场景 |
|---|---|---|
| official_api | 官方 API 发布 | 抖音部分能力、公众号、百家号部分能力 |
| browser_assist | 浏览器辅助填充和提交 | 小红书、视频号、知乎、部分百家号 |
| manual_confirm | 系统生成发布清单，人工到平台发布 | 权限不足或风控风险高的平台 |
| sandbox | 测试账号或测试应用 | 开发/验收环境 |
| recorded | 录制真实响应后回放 | 不稳定外部接口测试 |
| disabled | 禁用发布 | 平台未配置或能力不可用 |

---

## 3. 平台发布能力矩阵

| 平台 | 图文 | 视频 | 文章/问答 | 推荐 P0 模式 | 备注 |
|---|---:|---:|---:|---|---|
| 抖音 | 支持/部分 | 支持 | 不适用 | official_api + browser_assist | 评论回复另属 Interaction Ops |
| 小红书 | 支持 | 支持 | 不适用 | browser_assist + skill | 发布后人工确认优先 |
| 微信公众号 | 图文文章 | 视频素材/链接 | 文章 | official_api | 文章发布最稳定 |
| 微信视频号 | 弱 | 视频为主 | 不适用 | browser_assist + manual | 不承诺全自动 |
| 百家号 | 图文 | 视频 | 文章 | official/browser_assist | SEO 分发优先 |
| 知乎 | 图文回答 | 视频弱 | 回答/文章 | browser_assist + manual | 内容专业获客优先 |

---

## 4. 数据模型

### 4.1 PublishJob

```prisma
model PublishJob {
  id                String   @id @default(cuid())
  contentItemId     String
  contentVariantId  String
  platform          String
  platformAccountId String
  contentType       String
  publishMode       String
  status            String
  scheduledAt       DateTime?
  publishedAt       DateTime?
  externalPublishId String?
  externalUrl       String?
  retryCount        Int      @default(0)
  maxRetries        Int      @default(3)
  lastErrorCode     String?
  lastErrorMessage  String?
  createdBy         String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([platform, status])
  @@index([scheduledAt])
}
```

### 4.2 PublishAttempt

```prisma
model PublishAttempt {
  id             String   @id @default(cuid())
  publishJobId   String
  providerName   String
  providerMode   String
  status         String
  startedAt      DateTime?
  finishedAt     DateTime?
  externalId     String?
  externalUrl    String?
  errorCode      String?
  errorMessage   String?
  requestSummary Json?
  responseSummary Json?
  screenshotKey  String?
  createdAt      DateTime @default(now())

  @@index([publishJobId])
  @@index([providerName, status])
}
```

### 4.3 ManualPublishChecklist

```prisma
model ManualPublishChecklist {
  id            String   @id @default(cuid())
  publishJobId  String   @unique
  platform      String
  steps         Json
  status        String
  completedBy   String?
  completedAt   DateTime?
  notes         String?
  createdAt     DateTime @default(now())
}
```

### 4.4 BrowserSession

```prisma
model BrowserSession {
  id             String   @id @default(cuid())
  platform       String
  platformAccountId String
  status         String
  loginRequired  Boolean  @default(false)
  startedAt      DateTime?
  endedAt        DateTime?
  lastScreenshotKey String?
  errorMessage   String?
  createdAt      DateTime @default(now())
}
```

---

## 5. 状态机

### 5.1 PublishJob 状态

```text
draft
scheduled
queued
publishing
waiting_browser_login
waiting_human_confirm
published
failed
cancelled
```

合法流转：

```text
draft -> scheduled
scheduled -> queued
queued -> publishing
publishing -> waiting_browser_login
publishing -> waiting_human_confirm
publishing -> published
publishing -> failed
waiting_browser_login -> publishing
waiting_human_confirm -> published
waiting_human_confirm -> failed
failed -> queued
scheduled -> cancelled
queued -> cancelled
```

规则：

```text
1. cancelled 不能再次发布。
2. published 不能重复发布，除非创建新任务。
3. browser_assist 模式必须允许 waiting_browser_login。
4. manual_confirm 模式必须进入 waiting_human_confirm。
5. retryCount 超过 maxRetries 后进入 failed。
```

---

## 6. Provider 接口

```ts
export interface PublishProvider {
  getCapabilities(): Promise<PublishCapabilities>;
  publishTextImage(input: PublishTextImageInput): Promise<PublishResult>;
  publishVideo(input: PublishVideoInput): Promise<PublishResult>;
  publishArticle(input: PublishArticleInput): Promise<PublishResult>;
  fetchPublishStatus(input: FetchPublishStatusInput): Promise<PublishStatusResult>;
}
```

能力声明：

```ts
export type PublishCapabilities = {
  platform: PlatformCode;
  publishTextImage: boolean | 'limited';
  publishVideo: boolean | 'limited';
  publishArticle: boolean | 'limited';
  supportsSchedule: boolean;
  supportsDraft: boolean;
  supportsStatusFetch: boolean;
  requiresHumanConfirm: boolean;
  supportedModes: PublishMode[];
};
```

---

## 7. API 设计

```http
POST /api/publish-jobs
GET /api/publish-jobs
GET /api/publish-jobs/:id
POST /api/publish-jobs/:id/execute
POST /api/publish-jobs/:id/retry
POST /api/publish-jobs/:id/cancel
POST /api/publish-jobs/:id/manual-complete
GET /api/publish-jobs/:id/attempts
GET /api/publish-jobs/:id/checklist
```

---

## 8. Worker 任务

```text
publish.schedule.scan
publish.execute
publish.browser_assist
publish.status.fetch
publish.retry
publish.manual_complete
```

---

## 9. 前端页面

| 页面 | 路径 | 作用 |
|---|---|---|
| 发布任务列表 | /publish | 查看所有发布任务 |
| 发布任务详情 | /publish/jobs/[id] | 查看状态、日志、失败原因 |
| 发布日历 | /publish/calendar | 排期视图 |
| 人工发布待办 | /publish/manual | 处理 manual/browser assist 任务 |
| Browser Session | /publish/browser-sessions | 登录态和辅助发布状态 |

---

## 10. 测试验收

必须测试：

```text
1. 创建发布任务写入 DB。
2. 立即发布进入队列。
3. manual_confirm 任务进入人工确认。
4. browser_assist 任务可进入 waiting_browser_login。
5. 发布成功写 PublishAttempt。
6. 发布失败写错误原因。
7. 重试次数递增。
8. cancelled 任务不能执行。
9. 每个平台 Provider 返回能力矩阵。
10. 不支持能力时返回明确错误。
```
