# 34. 获客任务绑定账号重新登录 Plan

> 关联：[33_获客任务绑定账号重新登录_SPEC](./33_获客任务绑定账号重新登录_SPEC.md)
> 方式：SDD + TDD
> 状态：已实施

## 0. 总览（测试先行）

| 切片 | 任务 | 测试先行 | 产出 | 依赖 |
|---|---|---|---|---|
| S1 | 恢复账号 + 详情账号名 | `tests/integration/api/account-restore.test.ts`（新） | — | — |
| S2 | 登录提示组件 | `tests/web/unit/bound-account-login-notice.test.tsx`（新） | — | — |
| S3 | 后端 | S1 | `apps/api/src/routes.ts`（POST /api/accounts/:id/restore）、`apps/api/src/routes-prospecting.ts`（GET /tasks/:id include） | S1 |
| S4 | 前端 | S2 | `apps/web/src/lib/api/integrations.ts`（restorePlatformAccount）、`apps/web/src/components/prospecting/BoundAccountLoginNotice.tsx`（新）、详情页接线 | S3 |

## 1. S1 集成测试（Red）

参照 `account-duplicate-name.test.ts` 骨架：seed + 软删除账号 + 同名活跃账号场景；另直接建任务行断言 `GET /api/prospecting/tasks/:id` 的 `platformAccountName`。

## 2. S3 后端（Green）

1. restore 路由挂在账号路由区（`qr-login` 之前）：查 `deletedAt != null` 的组织内账号；同名活跃冲突检查 `(organizationId, platform, name)` 唯一；恢复字段 `{ deletedAt: null, status: 'expired', cookieRef: null }`；返回脱敏 DTO（复用 `toPlatformAccountDto`）。
2. `GET /tasks/:id`：include `platformAccount: { select: { name } }`，响应附加 `platformAccountName`。

## 3. S2/S4 前端（Green）

1. `restorePlatformAccount(id)` → `POST /api/accounts/:id/restore`。
2. `BoundAccountLoginNotice`：纯展示（`accountName`、`platformLabel`、`onLogin`、`pending`）。
3. 详情页：needsLogin 分支渲染 Notice；`handleRelogin` = restore → 打开 `BrowserLoginDialog`；onClose 失效 guard/task 查询；增量执行点击 needsLogin 时走 `handleRelogin`。

## 4. 验收命令

```bash
corepack pnpm vitest run tests/integration/api/account-restore.test.ts
corepack pnpm vitest run --config vitest.web.config.ts tests/web/unit/bound-account-login-notice.test.tsx
corepack pnpm typecheck && corepack pnpm lint
```
