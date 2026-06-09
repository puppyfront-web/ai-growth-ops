# API 参考

所有 API 端点基于 `http://localhost:3100`。

支持 API 版本化前缀: `/api/v1/...` 等同于 `/api/...`

## 认证

所有认证后的端点需要 Header:

```
Authorization: Bearer <token>
X-Organization-Id: <org-id>
```

---

## Auth 认证端点

| Method | Path                            | 说明                                 |
| ------ | ------------------------------- | ------------------------------------ |
| POST   | `/api/auth/login`               | 登录 (email + password)              |
| POST   | `/api/auth/register`            | 注册 (email + password + name)       |
| POST   | `/api/auth/verify-email`        | 验证邮箱 (token)                     |
| POST   | `/api/auth/forgot-password`     | 发送密码重置邮件                     |
| POST   | `/api/auth/reset-password`      | 重置密码 (token + password)          |
| PUT    | `/api/auth/change-password`     | 修改密码 (oldPassword + newPassword) |
| POST   | `/api/auth/logout`              | 吊销当前 Token                       |
| POST   | `/api/auth/resend-verification` | 重发验证邮件                         |

## 组织管理

| Method | Path                                     | 说明             |
| ------ | ---------------------------------------- | ---------------- |
| GET    | `/api/org`                               | 列出用户所属组织 |
| POST   | `/api/org`                               | 创建组织         |
| GET    | `/api/org/:orgId`                        | 组织详情         |
| PATCH  | `/api/org/:orgId`                        | 更新组织         |
| GET    | `/api/org/:orgId/members`                | 成员列表         |
| POST   | `/api/org/:orgId/invite`                 | 邀请成员         |
| POST   | `/api/org/:orgId/accept-invite`          | 接受邀请         |
| DELETE | `/api/org/:orgId/members/:memberId`      | 移除成员         |
| PATCH  | `/api/org/:orgId/members/:memberId/role` | 变更角色         |

## 内容管理

| Method | Path                     | 说明            |
| ------ | ------------------------ | --------------- |
| GET    | `/api/content-items`     | 内容列表 (分页) |
| POST   | `/api/content-items`     | 创建内容        |
| GET    | `/api/content-items/:id` | 内容详情        |
| PATCH  | `/api/content-items/:id` | 更新内容        |
| DELETE | `/api/content-items/:id` | 删除内容        |
| GET    | `/api/content-variants`  | 变体列表 (分页) |
| POST   | `/api/content-variants`  | 创建变体        |

## 发布管理

| Method | Path                           | 说明                |
| ------ | ------------------------------ | ------------------- |
| GET    | `/api/publish-jobs`            | 发布任务列表 (分页) |
| POST   | `/api/publish-jobs`            | 创建发布任务        |
| GET    | `/api/publish-jobs/:id`        | 任务详情            |
| POST   | `/api/publish-jobs/:id/retry`  | 重试任务            |
| POST   | `/api/publish-jobs/:id/cancel` | 取消任务            |

## 线索管理

| Method | Path             | 说明            |
| ------ | ---------------- | --------------- |
| GET    | `/api/leads`     | 线索列表 (分页) |
| POST   | `/api/leads`     | 创建线索        |
| PATCH  | `/api/leads/:id` | 更新线索        |

## 互动管理

| Method | Path                              | 说明            |
| ------ | --------------------------------- | --------------- |
| GET    | `/api/interactions`               | 互动列表 (分页) |
| POST   | `/api/interactions/sync-comments` | 同步评论        |
| POST   | `/api/interactions/sync-messages` | 同步私信        |

## 分析

| Method | Path                              | 说明     |
| ------ | --------------------------------- | -------- |
| GET    | `/api/analytics/overview`         | 概览数据 |
| GET    | `/api/analytics/lead-trend`       | 线索趋势 |
| GET    | `/api/analytics/platform-metrics` | 平台指标 |
| GET    | `/api/analytics/content-metrics`  | 内容指标 |

## 通知

| Method | Path                               | 说明     |
| ------ | ---------------------------------- | -------- |
| GET    | `/api/notifications`               | 通知列表 |
| GET    | `/api/notifications/unread-count`  | 未读数量 |
| PATCH  | `/api/notifications/:id/read`      | 标记已读 |
| POST   | `/api/notifications/mark-all-read` | 全部已读 |

## CSV 导出

| Method | Path                           | 说明     |
| ------ | ------------------------------ | -------- |
| GET    | `/api/export/leads.csv`        | 导出线索 |
| GET    | `/api/export/content.csv`      | 导出内容 |
| GET    | `/api/export/interactions.csv` | 导出互动 |

## Webhook

| Method | Path                | 说明         |
| ------ | ------------------- | ------------ |
| GET    | `/api/webhooks`     | Webhook 列表 |
| POST   | `/api/webhooks`     | 创建 Webhook |
| DELETE | `/api/webhooks/:id` | 删除 Webhook |

## 审计日志

| Method | Path              | 说明         |
| ------ | ----------------- | ------------ |
| GET    | `/api/audit-logs` | 审计日志列表 |

## 系统健康

| Method | Path      | 说明                        |
| ------ | --------- | --------------------------- |
| GET    | `/health` | 健康检查 (含 DB/Redis 状态) |

## 通用响应格式

### 分页列表

```json
{
  "items": [...],
  "total": 100,
  "page": 1,
  "pageSize": 20
}
```

### 错误

```json
{
  "error": "错误描述",
  "errors": [{ "field": "email", "message": "请输入有效的邮箱地址" }]
}
```

## RBAC 权限矩阵

| 权限               | owner | admin | member | viewer |
| ------------------ | ----- | ----- | ------ | ------ |
| 内容 CRUD + 发布   | ✅    | ✅    | ✅     | 仅查看 |
| 线索查看/编辑/导出 | ✅    | ✅    | ✅     | 仅查看 |
| 互动查看/回复      | ✅    | ✅    | ✅     | 仅查看 |
| 分析查看/导出      | ✅    | ✅    | ✅     | 仅查看 |
| 团队管理           | ✅    | ✅    | ❌     | ❌     |
| 系统设置           | ✅    | ✅    | ❌     | ❌     |
| Webhook 管理       | ✅    | ✅    | ❌     | ❌     |
