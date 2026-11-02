# 32. 智能获客多账号执行 Plan

> 关联：[31_智能获客多账号执行_SPEC](./31_智能获客多账号执行_SPEC.md)
> 方式：SDD + TDD
> 状态：进行中

## 0. 总览（测试先行）

| 切片 | 任务 | 测试先行 | 产出 | 依赖 |
|---|---|---|---|---|
| S1 | 集成测试：多账号创建/校验/列表 | `tests/integration/api/prospecting-task-multi-account.test.ts`（新） | — | — |
| S2 | Web 单测：账号多选组件 | `tests/web/unit/prospecting-account-picker.test.tsx`（新） | — | — |
| S3 | 创建 schema + 路由扇出 | S1 | `apps/api/src/schemas/prospecting.ts`、`apps/api/src/routes-prospecting.ts`（POST /tasks、GET /tasks） | S1 |
| S4 | api client | S1 | `apps/web/src/lib/api/prospecting.ts` | S3 |
| S5 | Picker 组件 + 页面接线 | S2 | `apps/web/src/components/prospecting/ProspectingAccountPicker.tsx`（新）、`apps/web/src/app/(dashboard)/prospecting/page.tsx` | S4 |

## 1. S1 集成测试（Red）

参照 `tests/integration/api/prospecting-account-binding.test.ts` 骨架：`resetDatabase + seedDatabase + createApiServer + getTestAuth/createAuthFetch`、本地 LLM mock 产出计划、双 douyin 账号（A/B）。

用例：

1. `POST /api/prospecting/tasks` 带 `platformAccountIds: [A, B]` → 201 `{ tasks }` 长度 2、绑定正确、需求/策略一致；再次用同一 planId 创建 → 404（草稿已消费）。
2. 含 expired 账号 / 他组织账号 → 400 且错误信息含账号名或「不可用」；数据库断言：草稿 `consumedAt` 仍为 null、任务数为 0。
3. 不带数组 → 201 单个 task（回归）。
4. `GET /api/prospecting/tasks` items 含 `platformAccountName`，与账号名一致。

## 2. S3 后端实现（Green）

1. `createProspectingTaskSchema` 增加 `platformAccountIds: z.array(z.string().uuid()).min(1).max(10).optional()`。
2. `POST /tasks`：草稿与策略校验照旧 → 若带数组：逐个 `findProspectingAccount(db, orgId, draft.platform, id)`，null 则查账号名（组织内）拼进 `400 { error }`；全部通过后在事务内 `updateMany` 消费草稿 + `createMany`/循环 create 每账号任务（字段复制现有 create，`platformAccountId` 覆盖）；响应 `{ tasks }`。
3. `GET /tasks`：include `platformAccount: { select: { name: true } }`，items 映射附加 `platformAccountName`。

## 3. S2 Web 单测（Red）

纯展示组件直接 render（不 mock React Query，参照 `prospect-filter-bar.test.tsx`）：

1. 渲染账号行文案为 `抖音-xxx`、`抖音-yyy` 格式；含「自动选择可用账号（推荐）」。
2. 初始 auto=true 时账号行未勾选；点击账号行 → `onAutoChange(false)` + `onToggle(id, true)`；再点自动行 → 清空选择。
3. 行内提示：needsLogin → 「需重新登录」；captchaWaitMs>0 → 「验证码冷却中」；否则「今日剩余 X 条视频」。

## 4. S4/S5 前端实现（Green）

1. `createProspectingTask(payload)` 支持 `platformAccountIds`；任务 summary 类型加 `platformAccountName?: string | null`。
2. `ProspectingAccountPicker`：受控组件（`accounts: ProspectingGuard[]`、`auto: boolean`、`selectedIds: string[]`、`onAutoChange`、`onToggle`）；无可用账号时显示空态提示与「去账号管理」链接由外层处理。
3. 页面：状态改为 `autoAccount + selectedAccountIds`；分析需求用 `auto ? 'auto' : selectedIds[0]`；创建后对每个 task `runProspectingTask`（Promise.allSettled）汇总 toast；表格加「执行账号」列。
4. 旧的单账号配额提示块并入 Picker 行内提示 + 日限额说明。

## 5. 验收命令

```bash
pnpm test:integration -- tests/integration/api/prospecting-task-multi-account.test.ts tests/integration/api/prospecting-account-binding.test.ts
pnpm test:web -- tests/web/unit/prospecting-account-picker.test.tsx
pnpm typecheck
pnpm lint
```

## 6. 交付记录

- 已完成：S1（集成测试 5/5 绿）+ S3（后端多账号创建/列表账号名）+ S4（api client 输入参数）。
- **已暂停（用户指示，2026-11-02）**：S2/S5 未实施。暂停时移除了未实现的 Red 测试 `tests/web/unit/prospecting-account-picker.test.tsx`（组件未创建，避免套件常红），恢复实施时按本文 S2 用例重建。
- `createProspectingTask` 前端返回类型暂保持单任务形状（union 类型会破坏现有调用方编译），恢复 S5 时再切换。
