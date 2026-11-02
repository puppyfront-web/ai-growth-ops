# spec/29 小红书登录适配与统一平台登录适配器 SPEC

- 日期：2026-10-23（2026-10-24 修订：登录交互方案与抖音完全同构，移除平台专属准备动作）
- 状态：已评审（实现中）
- 关联：spec/12（Browser Bridge）、spec/14（平台账号多用户安全）、spec/20（恢复第 1 代扫码登录）

## 1. 背景

### 1.1 现状

平台扫码登录（qr-login）链路对六平台声明了配置，但登录相关配置散落在多处，且互为手工同步：

| 配置 | 位置 |
| --- | --- |
| 登录页 URL × 3 | `apps/browser-runner/src/platform-configs.ts`、`apps/api/src/browser-login-config.ts`、`packages/shared/src/browser-authorization.ts` |
| 登录态检测规则 | `apps/browser-runner/src/platform-configs.ts` |
| 必备 cookie × 2 | `packages/shared/src/platform-cookie.ts`、`packages/shared/src/browser-authorization.ts` |
| 基线兜底 cookie 白名单 | `apps/browser-runner/src/platform-configs.ts` |

新增一个平台的登录接入需要改 5~8 处，没有单一事实源。

### 1.2 小红书登录的真实缺陷（2026-10-23 本地实测证据）

对 `https://creator.xiaohongshu.com/login` 做了两次无登录 Playwright 探测（1280×900 视口、无头、zh-CN），结论：

1. **误判已登录（P0）**：未登录状态下页面即下发 `xsecappid`、`a1`、`webId`、`acw_tc` 等匿名 cookie。现行检测规则 `cookieNames: ['web_session', 'xsecappid']` 为或语义，会话创建后第一次轮询即命中 `xsecappid` → `finalizeLogin` 又不校验必备 cookie → runner 返回 `logged_in` + 匿名 cookie → API 侧 `validatePlatformCookie` 因缺 `web_session` 判无效 → 账号被置为 `error` 状态。整条链路从未被真实小红书账号触发过，因此未暴露。
2. **登录页形态（背景知识，不驱动自动化）**：登录卡默认展示「短信登录」表单，扫码入口是卡片右上角的粉色折角图标（纯图形，无文字）。两者均为有效登录方式——无论操作员扫码还是短信验证，成功后都会写入 `web_session`，检测逻辑对两者等价。

### 1.3 方案决策（2026-10-24，用户裁决）

小红书登录**必须与抖音走完全相同的交互方案，不引入任何平台专属方案**：有显示服务时由 runner 弹出真实浏览器窗口打开登录页，操作员在窗口内自行完成登录（扫码或短信均可）；无显示容器沿用所有平台共用的截图 + 远程交互降级。runner 不做自动点击折角图标等页面操作。（曾实现过「自动点击折角图标切扫码模式」的 `prepareLoginPage`，按本决策移除。）

## 2. 目标

1. **修掉小红书登录误判**：检测规则剔除匿名 cookie `xsecappid`，且 runner 侧判定登录必须验证平台必备 cookie（`web_session`），与 API 侧 `validatePlatformCookie` 双侧一致。
2. **登录交互与抖音零差异**：小红书复用与抖音完全相同的 `createSession/getSessionStatus` 链路——弹真实窗口、操作员自行登录、系统只盯 cookie；不为小红书新增任何自动页面操作。
3. **统一平台登录适配器**：在 `packages/shared` 新增登录适配器注册表（纯数据、无副作用），作为 loginUrl / 登录态检测规则 / 基线 cookie 白名单 / 必备 cookie 的单一事实源；`platform-cookie.ts`、`browser-login-config.ts`、browser-runner `platform-configs.ts` 全部改为派生消费。
4. **新平台接入收敛为 3 处**：Prisma `Platform` 枚举（迁移）、shared 登录适配器一条目、Web 展示标签（`types/enums.ts` + `constants.ts`）。browser-runner / API / cookie 校验零改动（除非平台需要手写检测器，如抖音）。

## 3. 非目标

- 不扩大 `PROSPECTING_SUPPORTED_PLATFORMS`（小红书仍为 Beta，遵守 AGENTS.md 约束）。
- 不做小红书用户画像采集（`/assist/fetch-user-profile` 的 XHS 分支）、搜索 DOM 兜底——另行立项。
- 不改 Browser Bridge（第 2 代本地助手）链路；其 `browser-authorization.ts` 中的 `allowedOrigins/cookieDomains/cookieNames` 保持本地维护，仅 `loginUrl/requiredCookieNames` 改为派生。
- 不改 Web UI（账号创建已支持小红书，扫码弹窗平台无关）。
- 不做真实小红书账号登录验收（需要真人操作，见 §8 验收指引）。
- 无数据模型变更、无迁移。

## 4. 架构设计

### 4.1 shared 登录适配器（新文件 `packages/shared/src/platform-login.ts`）

```ts
export interface PlatformLoginAdapter {
  platform: string;
  loginUrl: string;
  /** qr = 登录页可扫码；form = 仅表单。仅作描述用，交互链路不分平台。 */
  loginMode: 'qr' | 'form';
  /** 登录态候选判定（或语义）；命中后仍须 requiredCookieNames 全部在场 */
  detect: { cookieNames?: string[]; urlIncludes?: string[] };
  /** 基线兜底只统计这些名字的新增 cookie（避免 SSO 噪声） */
  baselineAuthCookieNames?: string[];
  /** 登录成功的必要 cookie：runner finalize 与 API validatePlatformCookie 双侧强校验 */
  requiredCookieNames: string[];
}
```

- 注册表 `PLATFORM_LOGIN_ADAPTERS: Record<string, PlatformLoginAdapter>` + `getPlatformLoginAdapter(platform)` + `getPlatformLoginAdapterPlatforms()`。
- **禁止把登录态检测写成函数**（shared 无副作用）；需要手写检测器的平台（当前仅抖音）在 browser-runner 侧以覆盖（override）方式注入。
- **适配器不携带任何页面操作指令**（无自动点击/输入类字段）：交互链路全平台统一，见 §1.3。

### 4.2 消费方派生

| 消费方 | 改动 |
| --- | --- |
| `packages/shared/src/platform-cookie.ts` | `REQUIRED_COOKIE_NAMES` 由注册表派生（行为不变，新增隐式一致性） |
| `packages/shared/src/browser-authorization.ts` | 各平台 `loginUrl`、`requiredCookieNames` 由注册表派生，bridge 专有字段保留 |
| `apps/api/src/browser-login-config.ts` | `loginUrls` 删除，`getLoginUrl` 查注册表 |
| `apps/browser-runner/src/platform-configs.ts` | `configs` 由注册表构建：`buildDetector(adapter)`；抖音保留手写 `detectDouyinLogin` 覆盖；`buildDetector` 的 `finalizeLogin` 强制传 `requiredCookieNames` |
| `apps/browser-runner/src/session-manager.ts` | 无行为改动——小红书与抖音共用同一 `createSession/getSessionStatus` 路径 |

### 4.3 小红书适配器条目（探测证据驱动）

```ts
xiaohongshu: {
  platform: 'xiaohongshu',
  loginUrl: 'https://creator.xiaohongshu.com/login',
  loginMode: 'qr',
  detect: { cookieNames: ['web_session'], urlIncludes: ['/creator/home', '/creator-center'] }, // 剔除 xsecappid
  baselineAuthCookieNames: ['web_session'],
  requiredCookieNames: ['web_session']
}
```

其余五平台条目等价迁移现行值（含修正：所有 `requiredCookieNames` 与 `platform-cookie.ts` 现值一致，避免行为漂移）。

### 4.4 行为兼容承诺

- `validatePlatformCookie`、`filterAuthorizationCookies`、runner `/session/*` API 形状与语义不变。
- 抖音登录行为不变（手写检测器 + 专属导航兜底保留）。
- 集成测试 `tests/integration/api/qr-login.test.ts`（六平台）不改预期。

## 5. API 与 UI

无新路由、无 UI 改动。既有链路：`POST /api/accounts/:id/qr-login/start|status|cancel` → browser-runner `/session/*`。小红书修复后：`status` 首轮应返回 `waiting_scan`（不再是 `logged_in` 假信号）；有显示环境弹出真实浏览器窗口，操作员扫码或短信登录均可完成。

## 6. 验收标准

1. 单元测试：小红书检测器在「仅有匿名 cookie（含 `xsecappid`）」时返回未登录；含 `web_session` 时返回已登录且 cookie 含 `web_session`。
2. 单元测试：六平台 `requiredCookieNames` 与 `validatePlatformCookie` 的必备字段一致（单一事实源一致性测试）。
3. 单元测试：小红书与抖音走同一会话链路（`createSession` 有显示环境弹真实窗口、打开登录页后不做任何额外页面操作）。
4. 单元/派生测试：`getLoginUrl(platform)`（API）与 runner `getPlatformLoginConfig(platform).loginUrl` 均等于注册表条目。
5. 集成测试：start 会话合并/复用响应必须保留首次响应的 `headed`/`qrImage`（React StrictMode 双次触发、15 秒内重复点击场景），否则前端弹窗会退回二维码分支（2026-10-24 修复，`browser-login-session.ts` 存储 start 元数据）。
6. 本地真实冒烟（不登录，仅公开页面）：browser-runner `/session/start {platform:'xiaohongshu'}` 正常建会话返回 `waiting_scan` 而非 `logged_in`；`/session/:id/cancel` 正常。
7. `pnpm typecheck`、`pnpm lint`、受影响单测与 `tests/integration/api/qr-login.test.ts` 通过。

## 7. 测试矩阵

| 场景 | 层 | 文件 |
| --- | --- | --- |
| 注册表完整性 / 小红书条目剔除匿名 cookie / 必备字段一致性 / 不携带页面操作指令 | shared | `tests/unit/shared/platform-login.test.ts`（新增） |
| 检测器：匿名 cookie 不登录 / web_session 登录 / 与注册表同步 | browser-runner | `tests/unit/browser-runner/platform-configs.test.ts`（扩展） |
| 小红书与抖音同一会话链路（弹真实窗口、零额外页面操作） | browser-runner | `tests/unit/browser-runner/session-manager.test.ts`（扩展） |
| 六平台 qr-login API 流程（含小红书） | integration | `tests/integration/api/qr-login.test.ts`（现有，不改预期） |
| 真实登录页冒烟 | 手动 | 本地 runner + curl，证据记入交付记录 |

## 8. 真实验收指引（本次不执行）

按 `docs/delivery/real-platform-acceptance-runbook.md`：真实小红书账号在弹出的浏览器窗口中完成登录（扫码或短信均可）→ `web_session` 入库加密 → `POST /api/accounts/:id/validate` 健康检查通过 → 记录外部 ID/时间/截图。验收通过前，小红书登录在能力矩阵中维持 `beta/未验收`，不得对外宣称「支持」。
