# 小红书登录适配与统一平台登录适配器（2026-10-23，10-24 修订）

关联规格：`spec/29_小红书登录适配与统一平台登录适配器_SPEC.md`、`spec/30_..._Plan.md`

## 方案（2026-10-24 用户裁决）

小红书登录与抖音**完全同一方案，不引入任何平台专属方案**：有显示服务时 runner 弹出真实浏览器窗口打开登录页，操作员在窗口内自行完成登录（小红书页面上扫码、短信验证均可，成功即写入 `web_session`）；无显示容器沿用所有平台共用的截图 + 远程交互降级。runner 不做自动点击、自动切换等页面操作，系统只负责盯 cookie。

> 初版曾实现「登录页加载后自动点击右上角折角图标切扫码模式」（`prepareLoginPage` + 适配器 `prepare` 字段），按用户裁决于 10-24 全部移除。

## 背景与问题

对 `https://creator.xiaohongshu.com/login` 的两次无登录 Playwright 探测（1280×900、无头、zh-CN）发现：

1. **登录误判（P0）**：未登录即下发 `xsecappid`/`a1`/`webId`/`acw_tc` 匿名 cookie，而旧检测规则 `cookieNames: ['web_session','xsecappid']` 为或语义且 `finalizeLogin` 不校验必备 cookie——会话创建首轮即返回 `logged_in` + 匿名 cookie，API 侧 `validatePlatformCookie` 判无效后把账号置为 `error`。该链路从未被真实小红书账号触发过，故未暴露。
2. **登录页默认短信表单**：扫码入口是登录卡右上角粉色折角图标（纯图形、无文字）。两种登录方式成功后均写入 `web_session`，检测逻辑对两者等价，因此无需任何页面操作介入。

## 改动

| 文件 | 内容 |
| --- | --- |
| `packages/shared/src/platform-login.ts`（新） | 平台登录适配器注册表：loginUrl / loginMode / 检测规则 / 基线 cookie 白名单 / 必备 cookie，单一事实源；不携带任何页面操作指令 |
| `packages/shared/src/platform-cookie.ts` | 必备字段改为注册表派生（行为不变） |
| `packages/shared/src/browser-authorization.ts` | `loginUrl`/`requiredCookieNames` 派生自注册表，Bridge 专有字段保留 |
| `apps/api/src/browser-login-config.ts` | 删除本地 loginUrls，`getLoginUrl` 查注册表 |
| `apps/browser-runner/src/platform-configs.ts` | configs 由注册表构建；`buildDetector` 强制校验必备 cookie；抖音保留手写检测器覆盖 |
| `apps/browser-runner/src/session-manager.ts` | 零行为改动（小红书与抖音共用同一会话链路） |
| `packages/database/src/index.ts`、`apps/api/src/routes-prospecting.ts` | 修复主分支既有 typecheck 失败（`ProspectCandidateWhereInput` 需从 `Prisma` 命名空间拍平导出；`filters` 标注类型） |

小红书检测规则修正：候选与必备 cookie 只认 `web_session`（剔除匿名 `xsecappid`），登录页 URL 命中时同样强校验 `web_session`。

新平台登录接入收敛为 3 处：Prisma `Platform` 枚举、`platform-login.ts` 一条适配器、Web 展示标签（`types/enums.ts` + `constants.ts`）；browser-runner / API / cookie 校验 / Bridge 授权零改动。

## 证据

- 单元测试（先红后绿）：`tests/unit/shared/platform-login.test.ts`（注册表完整性 / 匿名 cookie 黑名单 / 必备字段与 `validatePlatformCookie` 一致性 / 不携带页面操作指令）；`tests/unit/browser-runner/platform-configs.test.ts` 扩展（匿名 cookie 不判登录、`web_session` 判登录、URL 命中缺必备 cookie 不判登录、六平台与注册表同步）；`tests/unit/browser-runner/session-manager.test.ts` 扩展（小红书与抖音同一会话链路：弹真实窗口、打开登录页后零额外页面操作）。
- 全量门禁：`pnpm typecheck` 通过（含修复 routes-prospecting 既有 4 个 TS 错误）、`pnpm lint` 通过、`pnpm test:unit` 全量通过、`pnpm test:architecture` 通过。
- 集成：`tests/integration/api/qr-login.test.ts` 37 项通过（六平台登录流程，未改预期）。
- 真实登录页冒烟（未登录、仅公开页面）：本机 browser-runner `POST /session/start {platform:"xiaohongshu"}` 正常建会话并打开真实登录页，状态轮询为 `waiting_scan`（不再是误判的 `logged_in`）；`POST /session/:id/cancel` 正常。

## 2026-10-24 追加修复：start 会话合并响应丢失 headed（弹窗退回二维码分支的根因）

- 现象：开发模式（React StrictMode 双次触发 start）或 15 秒内重复点击时，第二个请求命中 API 的「复用会话」分支（`routes.ts` qr-login/start 的 `getFreshSession` 路径），该分支只返回 `{sessionId, status}`，**丢失 `headed`/`qrImage`** → 前端 `setHeaded(false)` → 弹窗退回「网页内展示二维码」分支（展示的是登录页卡片截图），同时真实浏览器窗口照常弹出——即用户看到的「又截图又开窗」。
- 修复：`browser-login-session.ts` 的 `LoginSession` 增加首次响应元数据（`headed`/`qrImage`），`setSession` 存储、`getFreshSession` 原样带回；`routes.ts` 两处复用分支响应补齐 `headed`/`qrImage`。
- 证据（先红后绿）：`tests/integration/api/qr-login.test.ts` 合并用例扩展断言「并发第二次与复用窗口内第三次 start 均返回 `headed: true` 与相同 `qrImage`」，修复前失败（`expected undefined to be true`）、修复后 37 项全部通过；typecheck/lint 通过。

## 未完成与风险

- **真实账号登录验收未执行**（需操作员在弹出的窗口中真人完成登录）：按 `docs/delivery/real-platform-acceptance-runbook.md` 完成后，小红书登录才可脱离 `未验收`。二维码过期后的实际文案与自动刷新行为待真机确认（当前依赖通用「刷新」按钮与过期标记）。
- 集成套件存在既有失败（干净主分支复现）：`platform-account-security`（`api.delete` 不存在）、`account-auth-expired`（Bridge 401）已记录于交付状态；本轮另观察到 `outreach`、`experiment-wiring`、`douyin-e2e-workflow`（Phase 3 超时连锁）在主分支同样失败，与本次改动无关，待修。
