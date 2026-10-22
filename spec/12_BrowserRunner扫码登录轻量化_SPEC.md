# 多平台本地浏览器授权桥 SPEC

## 1. 背景

当前扫码授权由阿里云上的 `apps/browser-runner` 同步启动 Chromium，再通过二维码截图、CDP screencast 和坐标输入模拟远程桌面。线上已出现启动请求在 60 秒处中止；扫码后的验证方式选择、短信验证码和未知验证页面也使截图交互持续膨胀。

最初的 headed Chromium 体验更完整，但窗口只会出现在 browser-runner 所在机器。新方案把交互式授权重新放回用户本机的真实 Chrome，服务器不再承担登录浏览器、画面流和远程输入。

## 2. 目标

1. Web 发起授权后立即返回 `202`，不等待浏览器启动。
2. 本地 Browser Bridge 使用系统 Chrome/Edge 的独立持久 Profile 打开平台登录页。
3. 用户直接在真实网页完成扫码、验证方式选择、短信验证码和平台新增的未知验证步骤。
4. 支持当前所有平台注册配置，并通过声明式 Adapter 扩展新平台。
5. 一个 `PlatformAccount` 对应一个确定性的本地 Profile，避免同平台多账号串 Cookie。
6. 一次性 Bridge Token 只绑定一个授权会话，过期、完成或取消后失效。
7. 只回传平台白名单 Cookie；API 校验后立即加密写入 `cookieRef`，明文不进入数据库、日志或 Web 响应。
8. 账号登录入口默认切换到本地浏览器助手；正式用户不接触仓库、终端、pnpm、会话 ID 或 Token。
9. 用户首次安装后，后续授权由 Web 通过 `aigrowthops://` 一键唤起；browser-runner 继续服务发布、采集等既有执行链。

## 3. 非目标

- 本阶段不实现验证码破解、自动滑块、指纹伪装或风控规避。
- 不删除 browser-runner 的发布、采集、评论或私信执行能力。
- 本阶段交付浏览器助手安装入口与自定义 URL Scheme；CLI 仅保留为开发诊断入口，不得出现在正式 UI 和用户文档中。
- 代码仓库不伪造已签名安装包；macOS 公证、Windows 代码签名和阿里云 OSS 产物上传属于发布门禁，缺少证书时必须标记为未发布。
- 不承诺本地 Cookie 能跨设备、跨 IP 在阿里云长期工作；每个平台仍需真实健康检查。
- 不把 Mock、Cookie 字段存在或单元测试视为平台真实验收。

## 4. 架构

```text
线上 HTTPS Web
  └─ POST /api/accounts/:id/browser-login/start
        └─ DB BrowserSession + 一次性 Bridge Token
             ↓
`aigrowthops://authorize` 唤起已安装的本地浏览器助手
  ├─ 使用 Token 领取指定会话
  ├─ 系统 Chrome + 独立 user-data-dir
  ├─ 用户在真实网页完成授权
  └─ 回传白名单 Cookie
             ↓
API
  ├─ 校验会话 Token、过期时间和账号归属
  ├─ validatePlatformCookie
  ├─ encryptToken → PlatformAccount.cookieRef
  └─ BrowserSession = logged_in
```

### 4.1 组件职责

| 组件 | 职责 |
| --- | --- |
| Web | 创建会话、自动唤起助手、提供安装入口、轮询授权状态、取消和重试 |
| API | 组织隔离、一次性会话、Token 校验、凭据白名单复核、加密持久化、审计 |
| 浏览器助手 | 校验可信服务地址、启动本机系统 Chrome、管理账号 Profile、检测授权完成、回传凭据 |
| PlatformAuthorizationAdapter | 登录 URL、允许域名、必要 Cookie 名、Cookie 域名和 Profile 命名 |
| browser-runner | 仅保留既有发布、采集与自动化执行，不再参与扫码登录 |

## 5. 平台 Adapter

Adapter 必须是纯数据和纯函数，不允许远程下发可执行 JavaScript：

```ts
interface PlatformAuthorizationAdapter {
  platform: string;
  loginUrl: string;
  allowedOrigins: readonly string[];
  cookieDomains: readonly string[];
  requiredCookieNames: readonly string[];
}
```

授权成功的最低判断是必要 Cookie 齐备；API 仍必须执行现有 Cookie 结构校验。真实平台健康检查与 Cookie 可迁移性属于独立验收证据。

## 6. 数据模型

复用历史 `BrowserSession` 表，增量增加：

- `organizationId String?`
- `provider String @default("local_bridge")`
- `bridgeTokenHash String?`
- `expiresAt DateTime?`
- `claimedAt DateTime?`
- `completedAt DateTime?`
- `cancelledAt DateTime?`
- `metadata Json?`

新会话写入时 `organizationId` 必填；所有用户侧查询同时过滤 `organizationId + platformAccountId`。历史行允许为空，不删除历史数据。

`metadata` 只保存非敏感信息，例如 `profileRef`、Bridge 版本和错误码；禁止保存 Cookie、Token 和完整页面内容。

## 7. API 契约

### 7.1 用户侧开始授权

`POST /api/accounts/:id/browser-login/start`

- 账号必须属于当前组织。
- 返回 `202`：

```json
{
  "sessionId": "...",
  "status": "waiting_local_bridge",
  "expiresAt": "...",
  "launchUrl": "aigrowthops://authorize?...",
  "installerUrl": "https://.../browser-assistant"
}
```

`launchUrl` 只能交给浏览器协议处理器，不得渲染为文本、复制按钮或写入日志。`installerUrl` 由部署环境配置；未配置时 UI 只提示联系管理员，不产生无效下载链接。

- 同账号 15 秒内的重复开始请求复用同一会话和稳定派生的一次性 Token；服务端不保存可解密 Token，避免前端重复请求使已展示命令失效。
- 新开始请求会取消该账号更早的未完成会话。

### 7.2 用户侧状态

`GET /api/accounts/:id/browser-login/status`

```ts
type BrowserLoginStatus =
  | { status: 'waiting_local_bridge'; expiresAt: string }
  | { status: 'waiting_user'; expiresAt: string }
  | { status: 'logged_in' }
  | { status: 'cancelled' | 'expired' | 'error'; error?: string };
```

响应不得包含 Bridge Token 或平台 Cookie。

### 7.3 Bridge 侧协议

- `GET /api/browser-bridge/sessions/:id`：Bearer Bridge Token 领取会话，返回平台、账号 ID、登录 URL 和 Adapter 白名单。
- `POST /api/browser-bridge/sessions/:id/complete`：提交白名单 Cookie 字符串，成功后 Token 立即失效。
- `POST /api/browser-bridge/sessions/:id/error`：提交稳定错误码和脱敏信息。

Bridge 端点不依赖用户 JWT，只依赖一次性高熵 Token；Token 比较使用 SHA-256 哈希和恒定时间比较。

### 7.4 取消

`POST /api/accounts/:id/browser-login/cancel`

将会话设为 `cancelled` 并清除加密 Token。本地 Bridge 在下一次状态检查或回传时停止并关闭对应浏览器上下文。

## 8. 本地 Profile

- 默认目录：操作系统应用数据目录下的 `ai-growth-ops/browser-bridge/profiles/<platform>/<accountId>`。
- `platform` 和 `accountId` 必须经过路径字符白名单清洗。
- 使用 `playwright-core` 的系统 `chrome` channel，不下载 Playwright Chromium。
- Profile 不上传服务器，不进入 Git，不与用户默认 Chrome Profile 混用。
- 同一 Profile 同时只允许一个授权进程；使用进程内锁和 Chrome Profile 锁共同拒绝并发。

## 9. 安全要求

1. Bridge Token 使用服务端密钥与随机会话 ID 做 HMAC 派生，数据库只保存 SHA-256 哈希；重复开始请求返回同一会话 Token，不保存可解密副本。
2. 会话默认 10 分钟过期，完成、取消和错误后清除 Token。
3. Bridge 只导航到 Adapter 的 `loginUrl`，重定向超出允许域名时停止并报错。
4. Bridge 只导出 Adapter 指定域名和名称的 Cookie，包括必要的 HttpOnly Cookie。
5. API 再次执行 Cookie 名称白名单和平台校验，拒绝跨平台或缺字段凭据。
6. 错误、审计和测试快照不得包含 Cookie、Bridge Token、手机号全量和二维码。
7. 不向公网暴露 CDP、localhost daemon、VNC、WebRTC 或浏览器调试端口。
8. 助手只接受安装包内置或本地配置的可信 API Origin；不得仅凭传入 URL 向任意服务器回传平台 Cookie。

## 10. 状态与错误码

状态流转：

```text
waiting_local_bridge → waiting_user → logged_in
                    ↘ error
waiting_local_bridge/waiting_user → cancelled | expired
```

错误码至少包括：

- `BRIDGE_TOKEN_INVALID`
- `BRIDGE_SESSION_EXPIRED`
- `BRIDGE_SESSION_CANCELLED`
- `BROWSER_NOT_FOUND`
- `BROWSER_LAUNCH_FAILED`
- `UNSAFE_REDIRECT`
- `REQUIRED_COOKIE_MISSING`
- `CREDENTIAL_REJECTED`

## 11. 验收标准

1. 开始接口在 1 秒内返回 `202`，不调用 browser-runner。
2. API 重启后会话状态仍可查询，重复开始不会创建失联浏览器。
3. 非当前组织不能读取、取消或覆盖会话。
4. 无 Token、错误 Token、过期 Token和已消费 Token均不能提交凭据。
5. Web 响应和数据库会话不包含明文平台 Cookie。
6. 同平台两个账号获得不同本地 Profile 路径。
7. Bridge 使用系统 Chrome 完成人工交互，不提供截图坐标输入。
8. 默认登录链路不依赖 `BROWSER_RUNNER_URL`，发布和采集路径不回归。
9. 每个平台真实完成扫码、健康检查和一次低量只读操作前标记为 `未验收`。
10. 取消请求失败时弹窗保持打开并显示可恢复错误，不得产生未处理 Promise 或 Next.js 全屏错误。
11. Web 页面不出现命令、Token 或“打开终端”指引；助手已安装时一次点击即可进入真实网页授权。
12. 线上 `APP_URL` 和助手可信 Origin 使用同一个公网 HTTPS Origin；localhost 只允许开发测试。

## 12. 测试矩阵

| 层级 | 用例 |
| --- | --- |
| shared 单元 | Adapter、Profile 路径、Cookie 白名单、状态机 |
| API 单元 | Token 哈希、过期判断、重复开始复用 |
| API 集成 | 202、组织隔离、Bridge 领取、完成、取消、Token 一次性、Cookie 不泄漏 |
| Bridge 单元 | 系统 Chrome 参数、Profile 隔离、允许域名、Cookie 序列化 |
| Web 单元 | 自动协议唤起、安装入口、手动重试、等待用户、成功、错误、取消成功与失败，且页面不泄露命令/Token |
| 回归 | browser-runner 发布/采集既有测试 |
| 真实验收 | 单账号扫码、二次验证、多账号隔离、API 重启、Cookie 云端健康检查 |

## 13. 安装包与分发（2026-10-22 增补）

### 13.1 产物

- 构建命令：`BROWSER_ASSISTANT_TRUSTED_ORIGINS=<origin> pnpm assistant:build`（`scripts/build-browser-assistant.sh`）。
- 产物：`release/BrowserAssistant.app`（可直接安装）与 `apps/web/public/browser-assistant/BrowserAssistant-macOS.zip`（Web 下载入口，附 `.sha256`）。
- `.app` 结构：原生 Swift 启动壳（接收 `aigrowthops://` Apple Event，bash 无法接收 URL 事件）→ `Resources/assistant.sh` → 内置 Node 运行时 + 自包含 bundle（`main.mjs`，esbuild 内联 workspace 依赖，`playwright-core` 随包）。
- 关键状态用系统通知反馈（`BROWSER_ASSISTANT_NOTIFY=1` 时），文案不得包含 Token、Cookie 或完整链接。

### 13.2 信任与签名

- 构建时把 `BROWSER_ASSISTANT_TRUSTED_ORIGINS` 写入 `Resources/trusted-origins.conf`；运行期环境变量只能追加，不能绕过白名单校验。
- 签名为 ad-hoc（`codesign -`），未做 Apple Developer ID 公证；下载后首次打开需右键→打开或移除 quarantine 属性。取得开发者证书前，对外状态只能标 `未正式发布`。

### 13.3 增补测试矩阵

| 层级 | 用例 |
| --- | --- |
| Bridge 单元 | Origin 合并去重（env + 安装包内置）、通知文案不泄露 Token 且长度受限 |
| 构建验收 | zip 可下载、ad-hoc 签名校验通过、`open aigrowthops://` 唤起后账号会话进入 `waiting_user`/`logged_in` |

### 13.4 分发渠道（2026-10-22 增补）

- 默认分发渠道为 GitHub Releases：`ASSISTANT_API_ORIGIN=<线上 HTTPS Origin> pnpm assistant:release` 构建并以 `assistant-v<版本>-<时间>` 为 tag 发 布，Release 附 zip、sha256 与首开说明；服务端 `BROWSER_ASSISTANT_DOWNLOAD_URL` 指向 Release 资产 URL。
- 安装包不进入 Git 与 CI 产物；Linux CI 不构建安装包（Swift 壳需 macOS）。
- 若仓库为私有，下载者需具备仓库读权限；对外公开分发前必须完成 Developer ID 签名与公证。

### 13.5 运行时打包与启动反馈修复（2026-10-22 增补）

线上 `assistant-v0.1.0-202610221116` 安装包在任何机器上均无法启动：构建脚本只复制了 Homebrew `node` 可执行文件，未随包其 `libnode.137.dylib` 等依赖，助手被 `aigrowthops://` 拉起后 dyld 立即中止，且全程零反馈（Swift 壳丢弃子进程 stderr、`runner.ts` 的 `claim()` 在失败通知 try/catch 之外、双击直接启动无任何 UI）。本节为修复规格。

**Node 运行时打包**

- 内置 Node 改用 nodejs.org 官方发行版（`bin/node` + `lib/` 完整布局），置于 `Resources/node-runtime/`，不再取 PATH 中的 node（Homebrew 版动态链接 `/opt/homebrew` 下的 dylib，单拷贝必然失效）。
- 默认 `universal`（arm64 + x86_64 双架构，`lipo` 合并）；`ASSISTANT_ARCH=arm64|x86_64` 可构建单架构。Swift 壳同样按目标架构编译。
- 版本默认固定 `v22.23.4`，两个架构 tarball 均做 SHA-256 校验；下载缓存在 `release/node-distro/`，不进 Git。
- `assistant.sh` 改为执行 `Resources/node-runtime/bin/node`。

**构建冒烟门禁（防再次发出坏包）**

- 组装完成后必须执行 `Resources/node-runtime/bin/node -v` 并输出预期版本，失败即构建失败；无网络/校验不过同样失败，不允许跳过。

**启动反馈（消除「无任何反应」）**

- Swift 壳在收到 Apple Event 的 URL 后才拉起 `assistant.sh`；若启动后 2 秒内无 URL 事件（用户双击直接打开），发系统通知「请回到系统网页点击授权」后退出，不再留驻隐形进程。
- Swift 壳捕获子进程 stderr；子进程在壳退出前（约 5 秒窗口）异常退出且 stderr 不含 JS 层失败标记时，发兜底失败通知，并把 stderr 追加写入 `~/Library/Application Support/ai-growth-ops/browser-bridge/assistant.log` 供排障。
- `runner.ts` 将 `claim()`、Adapter 解析、Profile 目录创建全部纳入失败通知 try/catch：连接失败、会话不存在等启动期错误同样发系统通知，不再静默退出。

**边界与非目标**

- ad-hoc 签名与 Gatekeeper 首开拦截问题不变（需 Developer ID 公证，另行处理）；本节只修复「装了打不开、打开无反馈」。
- 安装包版本升至 0.1.1；旧包（0.1.0）全部不可用，需重新发布并让用户重新下载。

### 13.6 增补测试矩阵（2026-10-22）

| 层级 | 用例 |
| --- | --- |
| Bridge 单元 | claim 网络失败/浏览器启动失败均发出 failed 系统通知且不泄露 Token；完成路径发 completed 通知 |
| 构建验收 | 包内 `node -v` 冒烟通过；universal 包 `lipo -archs` 同时含 arm64 与 x86_64；`open aigrowthops://` 拉起后无效会话产生可见失败反馈 |
