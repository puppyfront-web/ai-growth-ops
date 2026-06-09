# 素材库与未来媒体生成接入补充 Spec v1.0

> 解决问题：当前项目不实现生图/生视频，但需要支持已有图片/视频素材管理，并预留未来 MediaGenerationProvider 接入。之前 Spec 对素材生命周期、审核状态、发布前检查和未来生成接口还不够细。

---

## 1. 模块边界

当前版本包含：

```text
图片上传
视频上传
封面上传
外部 URL 导入
素材分组
素材审核
素材关联内容
素材发布前检查
```

当前版本不包含：

```text
真实 AI 生图
真实 AI 生视频
自动剪辑
配音
字幕生成
数字人
```

未来预留：

```text
MediaGenerationProvider
ImageGenerationProvider
VideoGenerationProvider
ExternalModelApiProvider
ComfyUIProvider
```

---

## 2. 数据模型

### 2.1 MediaAsset

```prisma
model MediaAsset {
  id                  String   @id @default(cuid())
  fileName            String
  fileType            String
  mimeType            String?
  storageKey          String?
  externalUrl         String?
  sizeBytes           Int?
  durationSeconds     Int?
  width               Int?
  height              Int?
  sourceType          String
  reviewStatus        String
  generationProvider  String?
  generationJobId     String?
  generationCostEstimate Float?
  reviewedBy          String?
  reviewedAt          DateTime?
  rejectReason        String?
  createdBy           String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([fileType, reviewStatus])
}
```

sourceType：

```text
upload
external_url
manual_import
future_generation
```

reviewStatus：

```text
pending_review
approved
rejected
archived
```

### 2.2 MediaFolder

```prisma
model MediaFolder {
  id        String   @id @default(cuid())
  name      String
  parentId  String?
  createdAt DateTime @default(now())
}
```

### 2.3 MediaUsage

```prisma
model MediaUsage {
  id            String   @id @default(cuid())
  mediaAssetId  String
  contentItemId String?
  publishJobId  String?
  usageType     String
  createdAt     DateTime @default(now())
}
```

---

## 3. 状态机

```text
pending_review -> approved
pending_review -> rejected
approved -> archived
rejected -> pending_review
rejected -> archived
```

规则：

```text
1. 新上传素材默认 pending_review。
2. 外部 URL 导入默认 pending_review。
3. 未来生成素材默认 pending_review。
4. pending_review 不能用于发布。
5. rejected 不能用于发布。
6. archived 不能用于发布。
7. 只有 approved 可用于 PublishJob。
```

---

## 4. API 设计

```http
POST /api/media/upload
POST /api/media/import-url
GET /api/media
GET /api/media/:id
PATCH /api/media/:id/review
PATCH /api/media/:id/folder
DELETE /api/media/:id
GET /api/media/:id/usages
POST /api/media/:id/attach-to-content
```

未来预留：

```http
POST /api/media-generation/image
POST /api/media-generation/video
GET /api/media-generation/jobs/:id
```

当前这两个真实生成接口必须使用 DisabledProvider，返回：

```json
{
  "error": {
    "code": "MEDIA_GENERATION_DISABLED",
    "message": "当前版本未启用真实生图/生视频能力。"
  }
}
```

---

## 5. Provider 接口预留

```ts
export interface MediaGenerationProvider {
  getCapabilities(): Promise<MediaGenerationCapabilities>;
  generateImage(input: GenerateImageInput): Promise<MediaGenerationResult>;
  generateVideo(input: GenerateVideoInput): Promise<MediaGenerationResult>;
}
```

当前必须实现：

```text
DisabledMediaGenerationProvider
MockMediaGenerationProvider
```

规则：

```text
DisabledProvider 不生成任何素材。
MockProvider 只生成 metadata，不生成真实文件。
所有生成结果进入 MediaAsset 且 reviewStatus=pending_review。
```

---

## 6. 发布前检查

创建 PublishJob 时必须检查：

```text
1. 素材存在。
2. 素材 reviewStatus=approved。
3. 素材 fileType 符合目标平台要求。
4. 视频大小、时长、格式在平台限制内。
5. 图片数量在平台限制内。
6. 不符合则阻止发布任务创建。
```

---

## 7. 前端页面

| 页面         | 路径                        |
| ------------ | --------------------------- |
| 素材库       | /media                      |
| 上传素材     | /media/upload               |
| 素材审核     | /media/review               |
| 素材详情     | /media/[id]                 |
| 未来生成入口 | /media/generation，当前禁用 |

---

## 8. 测试验收

必须测试：

```text
1. 上传文件写入对象存储。
2. MediaAsset 写入 DB。
3. 默认 pending_review。
4. approved 后可关联内容。
5. pending_review 不能创建发布任务。
6. rejected 不能创建发布任务。
7. archived 不能创建发布任务。
8. DisabledMediaGenerationProvider 调用失败。
9. MockMediaGenerationProvider 只生成 metadata。
10. 未来生成素材默认 pending_review。
```
