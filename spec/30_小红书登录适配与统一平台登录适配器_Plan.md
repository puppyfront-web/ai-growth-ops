# spec/30 小红书登录适配与统一平台登录适配器 Plan

关联 SPEC：spec/29。按「先测试、后实现」排序。

> 执行状态（2026-10-24 修订）：T1~T7 完成；同日按用户裁决移除「折角图标自动点击」平台专属方案（原 T3/T4 中的 `prepareLoginPage` 与适配器 `prepare` 字段已删除，交互方案回归与抖音完全同构，见 SPEC §1.3）。证据见 `docs/delivery/2026-10-23-xhs-login-adapter.md`：单测通过（先红后绿）、`qr-login` 集成 37 项通过、typecheck/lint/架构守卫通过、本机真实登录页冒烟（会话正常建立且为 `waiting_scan`，不误判）。真实账号登录验收待操作员执行。

## 任务拆分

### T1 Red：shared 注册表一致性测试（先失败）
- 新增 `tests/unit/shared/platform-login.test.ts`：
  - 六平台条目齐全，字段完整（loginUrl / loginMode / requiredCookieNames 非空）；
  - 小红书 `detect.cookieNames` 不含 `xsecappid`（匿名 cookie），`requiredCookieNames = ['web_session']`，不携带任何页面操作指令；
  - `validatePlatformCookie` 的必备字段与注册表逐平台一致（导入两包对比）。
- 验收命令：`pnpm vitest run tests/unit/shared/platform-login.test.ts`（此时模块不存在，红）。

### T2 Green：`packages/shared/src/platform-login.ts`
- 实现 `PlatformLoginAdapter` / `PLATFORM_LOGIN_ADAPTERS` / `getPlatformLoginAdapter` / `getPlatformLoginAdapterPlatforms`，六平台条目按 spec/29 §4.3。
- `index.ts` 导出；T1 转绿。

### T3 Red：runner 检测强化测试（先失败）
- 扩展 `tests/unit/browser-runner/platform-configs.test.ts`：
  - 伪造 Page（context.cookies / storageState / pages / evaluate）：小红书仅有匿名 cookie 集（含 `xsecappid`）→ `detectLogin` 返回 `loggedIn:false`；补 `web_session` → `loggedIn:true` 且 cookie 串含 `web_session`；
  - `getPlatformLoginConfig` 六平台与 shared 注册表 loginUrl/detect 规则同步。
- 验收命令：`pnpm vitest run tests/unit/browser-runner/platform-configs.test.ts`（红）。

### T4 Green：browser-runner 派生
- `platform-configs.ts`：注册表构建 configs，抖音手写检测器覆盖；`buildDetector` 强制 `finalizeLogin(page, requiredCookieNames)`；`detectLoginWithBaseline` 的 sessionid 特判改为注册表 `requiredCookieNames`。
- `session-manager.ts`：**零行为改动**——小红书与抖音共用同一 `createSession/getSessionStatus` 链路（弹真实窗口、操作员自行登录）；在 `session-manager.test.ts` 补「同一链路、零额外页面操作」守护测试。
- T3 转绿；`tests/unit/browser-runner/session-manager.test.ts`、`browser-session.test.ts` 不回归。

### T5 派生消费：API 与 shared 内部
- `apps/api/src/browser-login-config.ts`：`getLoginUrl` 查注册表，删除本地 loginUrls。
- `packages/shared/src/platform-cookie.ts`：必备字段由注册表派生。
- `packages/shared/src/browser-authorization.ts`：`loginUrl`、`requiredCookieNames` 派生，bridge 专有字段保留。
- 现有 `tests/unit/shared/*`、`tests/unit/api/*`（如有 loginUrl 相关）不回归。

### T6 本地真实冒烟（不登录）
- 启动 browser-runner（dev 模式）→ curl `/session/start {platform:"xiaohongshu"}` → 断言会话正常建立、状态轮询首轮为 `waiting_scan`（不误判登录）→ `/session/:id/cancel`。
- 证据（命令输出）写入交付记录。

### T7 验证与文档
- `pnpm typecheck`、`pnpm lint`；
- `pnpm vitest run tests/unit/shared/platform-login.test.ts tests/unit/browser-runner/ tests/unit/shared/`；
- `pnpm test:integration -- tests/integration/api/qr-login.test.ts`；
- 更新 `docs/delivery/crm-release-status.md`：小红书登录「适配完成 + 本地冒烟通过，真实账号验收未完成（beta）」；新增交付记录 `docs/delivery/2026-10-23-xhs-login-adapter.md`（含探测证据与冒烟输出）。

## 依赖与风险

- T1→T2→T3→T4 串行；T5 依赖 T2；T6 依赖 T4；T7 最后。
- 风险：真实登录页 DOM 变化（折角图标位置/形态）→ 不影响本方案（登录动作由操作员完成，系统只盯 `web_session` cookie）；二维码过期文案未知 → 沿用通用「刷新」按钮，真机验收时确认。
- 风险：`browser-authorization.ts` 派生后与 Prisma 枚举漂移 → 一致性测试仅覆盖注册表内部，枚举与注册表的对齐靠 typecheck（web Platform union）+ 人工清单。
