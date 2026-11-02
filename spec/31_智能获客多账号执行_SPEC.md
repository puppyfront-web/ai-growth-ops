# 31. 智能获客多账号执行 SPEC

> 状态：规划冻结
> 关联：[10_获客闭环P1P2_Roadmap_SPEC](./10_获客闭环P1P2_Roadmap_SPEC.md)、[获客闭环 P0 交付记录](../docs/delivery/2026-10-19-acquisition-closed-loop.md)
> 目标读者：实现本功能的工程师与验收人

## 1. 背景

当前「智能获客」新建任务表单中，执行账号为单选下拉（或自动选择），一次只能指定一个平台账号执行搜索：

1. 多账号运营者想同时用多个账号跑同一获客需求（放大单日采集额度、分摊验证码风险），必须逐个手动建任务，需求描述与策略勾选要重复操作；
2. 账号下拉只显示账号名，多平台（抖音 + 小红书 beta）场景下无法区分同名或忘记账号归属平台；
3. 任务列表没有「执行账号」列，同一需求多账号执行后无法分辨每行任务用的哪个账号。

## 2. 目标与非目标

### 2.1 目标

- G1 新建任务表单的「执行账号」支持**多选**，选项文案为「平台-账号名」（如「抖音-张三」），并保留「自动选择可用账号（推荐）」默认项（与具体账号互斥）；
- G2 一次提交，服务端在同一事务内为**每个所选账号各创建一个获客任务**（共享同一份需求分析计划），全部账号校验通过才消费计划草稿（all-or-nothing）；
- G3 提交后对每个任务分别触发执行，启动结果如实反馈（成功 N 个；部分失败时点名账号与原因）；
- G4 任务列表新增「执行账号」列（平台-账号名，历史未绑定任务显示 `-`），列表接口返回 `platformAccountName`；
- G5 每个账号行内展示可用性提示（需重新登录 / 验证码冷却中 / 今日剩余视频额度）与单账号日限额说明。

### 2.2 非目标

- 不改变 `ProspectingTask` 与单账号的绑定模型（不加多对多/数组列，无数据库迁移）；
- 不做单任务内多账号轮换执行；配额、验证码、浏览器 Profile 仍按账号隔离；
- 不支持一次提交跨多个平台（平台仍单选，账号多选限于所选平台内的可用账号）；
- 不改潜客（ProspectCandidate）按账号的筛选与导出（该表无账号列，另行排期）；
- 不改 worker、browser-runner、定时调度与权限模型。

## 3. 交互设计（UI）

位置：`apps/web/src/app/(dashboard)/prospecting/page.tsx` 新建任务表单。

1. 「执行账号」由 `NativeSelect` 替换为竖排复选列表组件 `ProspectingAccountPicker`：
   - 首项「自动选择可用账号（推荐）」，勾选任意具体账号时自动取消，反之亦然；
   - 其后每账号一行：复选框 + 「平台-账号名」+ 行内状态提示；
   - 列表下方一条静态说明：单账号日限额（视频/主页，取自 guard.limits）。
2. 默认选择：仅 1 个可用账号时直接勾选该账号；多账号时默认「自动」；切换目标平台时重置。
3. 提交按钮文案与 pending 纪律不变（仅禁用触发按钮）；未勾选任何账号且未选自动时禁用提交。
4. 提交成功 toast：「已启动 N 个账号的获客任务」；部分账号启动失败时如实列出账号与原因；全部失败进入错误提示。创建成功后收起表单并刷新任务列表。
5. 任务列表表头在「平台」后增加「执行账号」列。

## 4. API 变更

### 4.1 创建任务 `POST /api/prospecting/tasks`

- 入参 `createProspectingTaskSchema` 新增可选字段 `platformAccountIds?: string[]`（1–10 个 uuid）；
- 携带该数组时：逐个用 `findProspectingAccount`（组织 + 平台 + browser_assist + active + 有 cookie）校验；任一不可用 → `400 { error: "执行账号不可用：…（账号名/原因）" }`，**不消费草稿、不创建任务**；
- 校验通过后在同一事务内：消费草稿一次 + 每账号创建一个 task（覆盖 `platformAccountId` 为该账号）；
- 响应：带数组时 `201 { tasks: Task[] }`；不带数组时保持现状 `201 Task`（向后兼容）；
- 权限不变：`research:create`。

### 4.2 任务列表 `GET /api/prospecting/tasks`

- items 每项附加 `platformAccountName: string | null`（include `platformAccount.name`）；
- 其余分页结构不变；权限不变：`research:view`。

## 5. 数据模型

无变更。`ProspectingTask.platformAccountId` 仍为单账号外键；多账号 = 多任务。

## 6. 验收标准与测试矩阵

| 编号 | 场景 | 层级 | 验收 |
|---|---|---|---|
| A1 | 双可用账号 + `platformAccountIds` 创建 | 集成 API | 201 返回 2 个任务，各自绑定正确账号；草稿被消费，再次创建 404 |
| A2 | 数组含不可用账号（expired / 非当前平台 / 他组织） | 集成 API | 400 且错误信息点名账号；草稿未消费、任务数为 0 |
| A3 | 不带数组创建（回归） | 集成 API | 行为与现状一致，返回单个 task |
| A4 | 任务列表返回 `platformAccountName` | 集成 API | items 含账号名，未绑定任务为 null |
| A5 | Picker 渲染与互斥交互 | Web 单测 | 选项为「平台-账号名」格式；勾选账号取消自动、勾选自动清空账号；回调正确触发 |
| A6 | 提交链路多任务启动 | Web 单测（组件回调）+ 手工验收 | 传入选中账号 id 数组；成功/部分失败文案如实 |

验收命令：

```bash
pnpm test:integration -- tests/integration/api/prospecting-task-multi-account.test.ts tests/integration/api/prospecting-account-binding.test.ts
pnpm test:web -- tests/web/unit/prospecting-account-picker.test.tsx
pnpm typecheck && pnpm lint
```
