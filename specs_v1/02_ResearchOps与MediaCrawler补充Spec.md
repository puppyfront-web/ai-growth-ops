# Research Ops 与 MediaCrawler 补充 Spec v1.0

> 解决问题：之前 Spec 有“市场调研/竞品分析/评论洞察”概念，但缺少采集任务、限频、熔断、数据入库、洞察生成和选题转内容的工程化设计。

---

## 1. 模块定位

Research Ops 只用于单品牌自用场景下的低频公开数据调研。

允许：

```text
公开内容采集
公开评论采样
关键词搜索
竞品账号公开内容分析
知乎问题/回答调研
小红书笔记调研
抖音公开视频评论洞察
```

禁止：

```text
采集私信
采集非公开数据
绕过验证码或风控
高频批量爬取
自动骚扰用户
作为对外数据采集服务
```

---

## 2. 运行模式

| 模式 | 说明 |
|---|---|
| real_crawler | 调用 MediaCrawler 真实低频采集 |
| recorded | 使用录制真实结果回放 |
| manual_import | 手动上传 CSV/Excel/JSON |
| disabled | 禁用采集 |

---

## 3. 数据模型

### 3.1 ResearchTask

```prisma
model ResearchTask {
  id             String   @id @default(cuid())
  name           String
  platform       String
  taskType       String
  mode           String
  status         String
  keywords       Json?
  targetAccounts Json?
  maxPosts       Int      @default(50)
  maxComments    Int      @default(200)
  frequency      String?
  rateLimitPolicy Json?
  lastRunAt      DateTime?
  nextRunAt      DateTime?
  failureCount   Int      @default(0)
  createdBy      String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

TaskType：

```text
keyword_search
competitor_account
post_comment_sample
zhihu_question_search
manual_import
```

### 3.2 CollectedPost

```prisma
model CollectedPost {
  id              String   @id @default(cuid())
  researchTaskId  String
  platform        String
  externalPostId  String
  authorName      String?
  authorUrl       String?
  title           String?
  contentSummary  String?
  url             String?
  likeCount       Int?
  commentCount    Int?
  collectCount    Int?
  shareCount      Int?
  publishedAt     DateTime?
  rawPayload      Json?
  createdAt       DateTime @default(now())

  @@unique([platform, externalPostId])
}
```

### 3.3 CollectedComment

```prisma
model CollectedComment {
  id               String   @id @default(cuid())
  collectedPostId  String
  platform         String
  externalCommentId String
  userNickname     String?
  content          String
  likeCount        Int?
  rawPayload       Json?
  publishedAt      DateTime?
  createdAt        DateTime @default(now())

  @@unique([platform, externalCommentId])
}
```

### 3.4 ResearchInsight

```prisma
model ResearchInsight {
  id             String   @id @default(cuid())
  researchTaskId  String
  insightType     String
  title           String
  summary         String
  evidence        Json
  confidence      Float?
  createdAt       DateTime @default(now())
}
```

### 3.5 ContentOpportunity

```prisma
model ContentOpportunity {
  id              String   @id @default(cuid())
  researchInsightId String?
  title           String
  description     String
  sourcePlatform  String
  suggestedPlatforms Json
  suggestedFormat String
  priority        String
  evidence        Json
  status          String
  createdContentId String?
  createdAt       DateTime @default(now())
}
```

---

## 4. 状态机

ResearchTask：

```text
draft
scheduled
queued
running
success
failed
paused
suspended
cancelled
```

规则：

```text
1. 连续失败超过阈值进入 suspended。
2. suspended 必须人工恢复。
3. running 时不能重复运行同一任务。
4. 所有任务必须受 maxPosts/maxComments 限制。
5. real_crawler 必须启用 rateLimitPolicy。
```

---

## 5. Provider 接口

```ts
export interface ResearchProvider {
  getCapabilities(): Promise<ResearchCapabilities>;
  searchPosts(input: SearchPostsInput): Promise<CollectedPostDTO[]>;
  collectPostComments(input: CollectCommentsInput): Promise<CollectedCommentDTO[]>;
  collectCreatorPosts(input: CollectCreatorInput): Promise<CollectedPostDTO[]>;
}
```

---

## 6. API 设计

```http
POST /api/research/tasks
GET /api/research/tasks
GET /api/research/tasks/:id
PATCH /api/research/tasks/:id
POST /api/research/tasks/:id/run
POST /api/research/tasks/:id/pause
POST /api/research/tasks/:id/resume
GET /api/research/tasks/:id/posts
GET /api/research/tasks/:id/comments
GET /api/research/insights
GET /api/research/opportunities
POST /api/research/opportunities/:id/create-content
POST /api/research/import
```

---

## 7. 队列任务

```text
research.schedule.scan
research.run
research.collect.posts
research.collect.comments
research.generate.insights
research.generate.opportunities
research.import.manual
```

---

## 8. AI 洞察输出

```json
{
  "painPoints": ["价格不透明", "案例不够明确"],
  "popularTopics": ["AI获客", "小红书自动运营"],
  "contentAngles": ["真实案例拆解", "成本对比"],
  "suggestedOpportunities": [
    {
      "title": "中小企业如何用 AI 降低获客成本？",
      "format": "article/video",
      "priority": "high",
      "evidence": ["多条评论询问成本和落地方式"]
    }
  ]
}
```

---

## 9. 前端页面

| 页面 | 路径 |
|---|---|
| 调研任务列表 | /research |
| 新建任务 | /research/new |
| 任务详情 | /research/tasks/[id] |
| 调研洞察 | /research/insights |
| 选题机会 | /research/opportunities |
| 竞品账号 | /research/competitors |
| 手动导入 | /research/import |

---

## 10. 测试验收

必须测试：

```text
1. 创建调研任务。
2. 执行任务进入队列。
3. 限频策略生效。
4. maxPosts/maxComments 生效。
5. 采集结果去重。
6. 失败写 CrawlerRunLog。
7. 连续失败熔断。
8. AI 洞察生成 ResearchInsight。
9. ContentOpportunity 可转 ContentItem。
10. MediaCrawler 不允许用于私信采集。
```
