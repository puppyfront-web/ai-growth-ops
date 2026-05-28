# 飞书 / 企业微信 Lead Sink 补充 Spec v1.0

> 解决问题：之前 Spec 已有“飞书/企微沉淀”概念，但缺少字段映射、幂等同步、外部映射、失败重试、销售分配、回写状态等工程设计。

---

## 1. 模块定位

本地系统是主数据源，飞书/企微是外部沉淀与协作目标。

```text
本地 Lead 为主记录
飞书多维表格为团队协作台账
飞书群机器人为高意向提醒
企微为客户私域承接和销售跟进
```

---

## 2. Lead Sink 类型

| Sink | 用途 |
|---|---|
| feishu_bitable | 线索写入飞书多维表格 |
| feishu_bot | A/B 级线索群提醒 |
| wecom_contact | 企微客户承接 |
| wecom_app_message | 企微应用消息提醒 |
| crm_webhook | 第三方 CRM |

---

## 3. 数据模型

### 3.1 LeadSinkConfig

```prisma
model LeadSinkConfig {
  id          String   @id @default(cuid())
  sinkType    String
  name        String
  enabled     Boolean  @default(false)
  config      Json
  fieldMapping Json?
  status      String
  lastTestAt  DateTime?
  lastError   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### 3.2 LeadExternalMapping

```prisma
model LeadExternalMapping {
  id           String   @id @default(cuid())
  leadId       String
  sinkType     String
  externalId   String
  externalUrl  String?
  syncStatus   String
  lastSyncAt   DateTime?
  createdAt    DateTime @default(now())

  @@unique([leadId, sinkType])
}
```

### 3.3 LeadSinkSyncLog

```prisma
model LeadSinkSyncLog {
  id             String   @id @default(cuid())
  leadId          String
  sinkConfigId    String
  action          String
  status          String
  requestSummary  Json?
  responseSummary Json?
  errorCode       String?
  errorMessage    String?
  createdAt       DateTime @default(now())
}
```

---

## 4. 幂等规则

```text
1. 同一个 leadId + sinkType 只能创建一个 LeadExternalMapping。
2. 已有 externalId 时，同步动作应 update，而不是 create。
3. 同步失败不能删除本地 Lead。
4. 飞书/企微不可用时必须写失败日志并可重试。
```

---

## 5. 字段映射

标准 Lead 字段：

```text
leadId
leadLevel
sourcePlatform
sourceAccount
sourceContentTitle
sourceInteractionContent
customerNickname
customerContact
intent
summary
tags
owner
followStatus
createdAt
```

飞书字段映射示例：

```json
{
  "线索ID": "leadId",
  "来源平台": "sourcePlatform",
  "客户昵称": "customerNickname",
  "意向等级": "leadLevel",
  "需求摘要": "summary",
  "负责人": "owner",
  "跟进状态": "followStatus"
}
```

---

## 6. API 设计

```http
GET /api/lead-sinks
POST /api/lead-sinks
PATCH /api/lead-sinks/:id
POST /api/lead-sinks/:id/test
GET /api/leads/:id/sync-logs
POST /api/leads/:id/sync-feishu
POST /api/leads/:id/sync-wecom
POST /api/leads/:id/notify-sales
```

---

## 7. 队列任务

```text
lead.sync.feishu_bitable
lead.notify.feishu_bot
lead.sync.wecom_contact
lead.notify.wecom_app_message
lead.sync.crm_webhook
lead.sync.retry
```

---

## 8. 前端页面

| 页面 | 路径 |
|---|---|
| Lead Sink 总览 | /integrations/lead-sinks |
| 飞书配置 | /integrations/feishu |
| 企微配置 | /integrations/wecom |
| 同步日志 | /leads/sync |
| 线索详情同步记录 | /leads/[id] |

---

## 9. 测试验收

必须测试：

```text
1. 飞书配置保存时密钥加密。
2. 企微配置保存时密钥加密。
3. testConnection 成功/失败有明确返回。
4. A 级线索同步飞书创建外部记录。
5. 重复同步不重复创建。
6. 同步失败写 LeadSinkSyncLog。
7. 飞书群通知失败不影响 Lead 主数据。
8. 企微同步失败可重试。
9. 字段映射缺失返回明确错误。
10. 本地 Lead 删除/归档不自动删除外部记录，除非显式配置。
```
