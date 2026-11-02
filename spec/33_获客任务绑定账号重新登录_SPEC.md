# 33. 获客任务绑定账号重新登录 SPEC

> 状态：已实施（2026-11-02）
> 关联：[31_智能获客多账号执行_SPEC](./31_智能获客多账号执行_SPEC.md)（并行）、`docs/delivery/crm-release-status.md`
> 背景：任务绑定账号被软删除后，增量执行仅提示"请扫码登录"并跳转账号配置页，用户无法分辨任务用的是哪个账号（2026-11-02 线上反馈，案例：任务绑定「黄鸭」，实际有效账号是「收拾收拾」）。

## 1. 背景

`needsLogin` 语义被重载：「任务绑定的账号行找不到（已删除/Cookie 失效）」与「组织内没有已登录账号」两种情况共用同一提示，且引导动作（跳转账号配置页）与任务无关，造成误判。

## 2. 目标与非目标

### 2.1 目标

- G1 任务详情接口返回 `platformAccountName`（含软删除行，经外键连接取名）。
- G2 详情页在 `guard.needsLogin` 且任务绑定账号时，明确提示「任务绑定的账号「X」需要重新登录」，并提供「恢复并扫码登录」动作：先恢复软删除账号行，再弹出 `BrowserLoginDialog`（复用现有组件，按 accountId 会话）。
- G3 新增 `POST /api/accounts/:id/restore`：恢复软删除账号；恢复后 `status=expired`、`cookieRef=null`（必须重新扫码后才能用于执行）；同名活跃账号冲突返回 409；组织隔离；权限 `integration:manage`。
- G4 登录成功后自动刷新守卫与任务数据，横幅消失，可直接增量执行。

### 2.2 非目标

- 不做任务换绑到其他账号（另行排期，见 spec/31 非目标）；
- 不放宽 `qr-login/start` 对软删除账号的过滤（恢复是显式动作，不隐式复活）；
- 不改 guard/执行链路对绑定账号的强校验（保持"不静默切换账号"设计）。

## 3. API

- `POST /api/accounts/:id/restore` → `200 { account: DTO }`；未删除 → `400 { error: '账号未处于删除状态，无需恢复' }`；他组织/不存在 → `404`；无 `integration:manage` → `403`。同名冲突无需处理：唯一约束 `[organizationId, platform, name]` 连软删除行一起生效，软删期间不可能出现同名活跃新行（创建路径走"复用软删行"），已用测试固定该前提。
- `GET /api/prospecting/tasks/:id` → 响应附加 `platformAccountName: string | null`。

## 4. UI

详情页 `guard.needsLogin && task.platformAccountId` 时：

- 横幅文案：「任务绑定的账号「{平台标签}-{账号名}」需要重新登录后才能增量执行。」
- 动作按钮「恢复并扫码登录」：调 restore（409/400 时 toast 原因）成功后打开 `BrowserLoginDialog`；关闭时失效 `['prospecting','guard']` 与 `['prospecting','task',id]`。
- 「增量执行」点击遇到 needsLogin 时同样进入该流程（替换原 `router.push('/integrations/platforms')`）。
- 任务未绑定账号（历史任务）保持现状。

## 5. 验收标准

| 编号 | 场景 | 层级 | 验收 |
|---|---|---|---|
| A1 | 恢复软删除账号 | 集成 | 200，deletedAt 置空，status=expired，cookieRef=null |
| A2 | 未删除账号调用恢复 | 集成 | 400「账号未处于删除状态」 |
| A3 | 同名冲突状态可达性 | 集成 | 唯一约束下"软删行+同名活跃行"不可创建（固定前提，restore 无 409 分支） |
| A4 | 他组织账号 | 集成 | 404 |
| A5 | 任务详情含账号名 | 集成 | platformAccountName 与账号名一致 |
| A6 | 横幅文案与动作 | Web 单测 | 显示「平台-账号名」；点击触发 onLogin |
