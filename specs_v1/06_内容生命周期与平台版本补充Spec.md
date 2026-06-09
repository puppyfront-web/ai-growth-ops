# 内容生命周期与平台版本补充 Spec v1.0

> 解决问题：之前 Spec 有 Content Ops、平台改写、发布任务概念，但缺少内容生命周期、平台版本、合规检测、发布前检查和内容到发布的强约束。

---

## 1. 模块目标

将内容从“选题/草稿”变成“可发布的多平台版本”。

核心链路：

```text
ContentOpportunity
→ ContentPlan
→ ContentItem
→ ContentVariant
→ ComplianceCheck
→ PublishJob
```

---

## 2. 内容类型

```text
text_image_post     图文
video_post          视频内容，视频由用户上传
wechat_article      公众号文章
zhihu_answer        知乎回答
baijiahao_article   百家号文章
```

当前 AI 只生成文本：

```text
标题
正文
视频脚本
口播稿
标签
话题
摘要
评论引导语
回复建议
```

不生成真实图片/视频。

---

## 3. 数据模型

### 3.1 ContentItem

```prisma
model ContentItem {
  id          String   @id @default(cuid())
  title       String
  contentType String
  body        String?
  script      String?
  sourceType  String
  status      String
  tags        Json?
  createdBy   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

sourceType：

```text
manual
research_opportunity
template
import
```

status：

```text
draft
editing
ready_for_review
approved
scheduled
published
archived
```

### 3.2 ContentVariant

```prisma
model ContentVariant {
  id            String   @id @default(cuid())
  contentItemId String
  platform      String
  title         String
  body          String?
  script        String?
  hashtags      Json?
  metadata      Json?
  status        String
  complianceStatus String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([contentItemId, platform])
}
```

### 3.3 ContentComplianceCheck

```prisma
model ContentComplianceCheck {
  id               String   @id @default(cuid())
  contentVariantId  String
  status           String
  riskLevel        String
  issues           Json
  suggestedFixes   Json?
  checkedBy        String?
  createdAt        DateTime @default(now())
}
```

---

## 4. 生命周期规则

```text
draft -> editing
editing -> ready_for_review
ready_for_review -> approved
approved -> scheduled
scheduled -> published
approved -> archived
```

规则：

```text
1. 只有 approved 的 ContentVariant 可以创建 PublishJob。
2. 每个平台版本必须独立合规检测。
3. 内容归档后不能创建新发布任务。
4. 内容已经 published 后不能直接编辑原版本，应创建 revision。
5. 没有 approved 素材的视频内容不能创建发布任务。
```

---

## 5. API 设计

```http
POST /api/contents
GET /api/contents
GET /api/contents/:id
PATCH /api/contents/:id
POST /api/contents/:id/generate-variants
POST /api/content-variants/:id/compliance-check
PATCH /api/content-variants/:id/approve
POST /api/content-variants/:id/create-publish-job
POST /api/contents/:id/archive
```

---

## 6. AI Skill

| Skill            | 输入               | 输出                     |
| ---------------- | ------------------ | ------------------------ |
| content-writing  | 选题、品牌资料     | 标题、正文、脚本         |
| platform-rewrite | 内容原文、目标平台 | 平台版本                 |
| compliance-check | 平台版本           | 风险级别、问题、修改建议 |
| comment-hook     | 内容主题           | 评论引导语               |

---

## 7. 前端页面

| 页面     | 路径               |
| -------- | ------------------ |
| 内容库   | /content           |
| 新建内容 | /content/new       |
| 内容详情 | /content/[id]      |
| 平台版本 | /content/variants  |
| 内容日历 | /content/calendar  |
| 内容模板 | /content/templates |

---

## 8. 测试验收

必须测试：

```text
1. 新建内容默认为 draft。
2. 生成 6 平台 ContentVariant。
3. 平台版本不能重复生成相同平台记录。
4. 合规检测失败时不能 approve。
5. approved 版本可创建 PublishJob。
6. 未 approved 版本不能创建 PublishJob。
7. published 内容修改必须创建 revision。
8. 视频内容必须关联 approved 视频素材。
9. 每个平台版本内容不为空。
10. AI 输出 schema 必须校验。
```
