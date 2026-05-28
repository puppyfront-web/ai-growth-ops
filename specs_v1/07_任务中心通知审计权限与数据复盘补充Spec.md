# 任务中心、通知、审计权限与数据复盘补充 Spec v1.0

> 解决问题：之前 Spec 提到了任务队列、复盘、权限和日志，但缺少统一任务中心、通知机制、审计记录、权限控制、指标口径与归因规则。

---

## 1. Task Center 任务中心

### 1.1 目标

让用户能看到所有异步任务的真实状态：

```text
发布任务
互动同步
调研采集
AI Skill 运行
飞书/企微同步
报告生成
素材处理
```

### 1.2 数据模型

```prisma
model SystemTask {
  id             String   @id @default(cuid())
  taskType        String
  title           String
  status          String
  relatedEntityType String?
  relatedEntityId String?
  progress        Int      @default(0)
  errorMessage    String?
  startedAt       DateTime?
  finishedAt      DateTime?
  createdBy       String?
  createdAt       DateTime @default(now())
}
```

状态：

```text
queued
running
success
failed
cancelled
suspended
```

### 1.3 API

```http
GET /api/tasks
GET /api/tasks/:id
POST /api/tasks/:id/retry
POST /api/tasks/:id/cancel
```

---

## 2. Notification 通知中心

### 2.1 通知类型

```text
高意向线索提醒
发布失败提醒
平台授权异常
Provider 熔断
飞书/企微同步失败
人工确认待办
调研任务完成
```

### 2.2 数据模型

```prisma
model Notification {
  id        String   @id @default(cuid())
  type      String
  title     String
  content   String
  level     String
  readAt    DateTime?
  actionUrl String?
  createdAt DateTime @default(now())
}
```

---

## 3. RBAC 权限设计

角色：

| 角色 | 权限 |
|---|---|
| Admin | 系统配置、平台账号、Provider、自动回复、密钥管理 |
| Operator | 内容、发布、调研、评论处理 |
| Sales | 线索跟进、已分配会话回复 |
| Viewer | 只读报表 |

权限点：

```text
content.create
content.approve
publish.execute
publish.cancel
interaction.reply
interaction.auto_reply_config
lead.assign
lead.sync
integration.manage
provider.manage
settings.manage
audit.view
```

---

## 4. AuditLog 审计日志

### 4.1 必须记录的动作

```text
登录
平台账号配置变更
密钥配置变更
开启/关闭自动回复
发送回复
人工审核回复
创建发布任务
执行发布
取消发布
同步飞书/企微
修改线索状态
删除/归档内容
```

### 4.2 数据模型

```prisma
model AuditLog {
  id          String   @id @default(cuid())
  actorId     String?
  action      String
  entityType  String
  entityId    String?
  before      Json?
  after       Json?
  ip          String?
  userAgent   String?
  createdAt   DateTime @default(now())

  @@index([action, entityType])
}
```

---

## 5. Secret 安全

规则：

```text
1. API Key、App Secret、Access Token 必须加密存储。
2. 前端永不返回明文 Secret。
3. 日志不得记录明文 Secret。
4. Secret 更新必须写 AuditLog。
5. 删除平台账号时必须清理 Token。
```

数据模型：

```prisma
model SecretRef {
  id        String   @id @default(cuid())
  scope     String
  key       String
  encryptedValue String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## 6. Analytics 数据复盘与归因

### 6.1 事件模型

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

事件类型：

```text
content_created
content_published
publish_failed
interaction_received
reply_sent
lead_created
lead_synced_feishu
lead_synced_wecom
lead_won
lead_lost
research_task_completed
```

### 6.2 指标口径

| 指标 | 口径 |
|---|---|
| 内容发布数 | PublishJob.status=published |
| 互动数 | Interaction 总数 |
| 咨询数 | leadLevel=A/B/C 的互动数 |
| A 级线索数 | Lead.leadLevel=A |
| 内容获客率 | Lead 数 / Published Content 数 |
| 平台获客贡献 | 平台 Lead 数 / 总 Lead 数 |
| 回复转线索率 | Lead 数 / ReplyAttempt success 数 |
| 调研转内容率 | 由 ContentOpportunity 创建的 ContentItem 数 / Opportunity 数 |

### 6.3 聚合任务

```text
analytics.aggregate.daily
analytics.aggregate.weekly
analytics.generate.report
```

---

## 7. 数据导入导出与备份

### 7.1 导入

支持：

```text
CSV 导入评论
CSV 导入线索
Excel 导入历史客户
JSON 导入调研结果
素材批量上传
```

### 7.2 导出

支持：

```text
线索导出 CSV/Excel
发布任务导出
互动数据导出
复盘报告导出
审计日志导出，仅 Admin
```

### 7.3 备份

```text
PostgreSQL 备份
MinIO 对象存储备份
配置导出
Skill 包导出
```

---

## 8. 前端页面

| 页面 | 路径 |
|---|---|
| 任务中心 | /tasks |
| 通知中心 | /notifications |
| 审计日志 | /settings/audit-logs |
| 权限管理 | /settings/team |
| 数据复盘 | /analytics |
| 导入导出 | /settings/data |
| 备份恢复 | /settings/backup |

---

## 9. 测试验收

必须测试：

```text
1. 所有异步任务创建 SystemTask。
2. 任务失败可重试。
3. 高意向线索创建通知。
4. 自动回复配置变更写 AuditLog。
5. Secret 不在 API 响应中明文返回。
6. Viewer 不能发送回复。
7. Sales 只能处理分配给自己的线索。
8. Analytics 指标聚合口径正确。
9. 导出文件生成并记录日志。
10. 备份命令可执行并产生文件。
```
