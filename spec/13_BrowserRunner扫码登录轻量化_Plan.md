# 多平台本地浏览器授权桥 Plan

## 2026-10-21 正式用户入口修订

- [x] Red：Web 测试要求自动唤起、安装入口和无命令/Token 页面。
- [x] Red：API 集成测试要求只返回 `launchUrl`，不返回 `bridgeToken` / `launchCommand`。
- [x] Red：助手单元测试要求解析自定义协议并拒绝非可信 API Origin。
- [x] Green：实现 `aigrowthops://authorize` 契约、Web 一键唤起和安装兜底。
- [x] Green：浏览器助手接受协议参数，并保持 CLI 仅作内部诊断。
- [x] Verify：受影响 Web、Bridge、API 集成测试以及 typecheck、lint、Bridge/Web build 通过。
- [ ] Release gate：生成并签名 macOS/Windows 安装包，上传到阿里云 OSS/CDN，配置 `BROWSER_ASSISTANT_DOWNLOAD_URL` 与助手可信 Origin；缺少真实签名产物时不得宣称线上可用。

## 1. 实施原则

- 直接把账号扫码登录默认路径切到本地 Bridge，不保留登录级自动回退。
- browser-runner 的发布、采集和同步职责保持不变。
- 先测试后实现；数据库、API、Bridge、Web 分层推进。
- 首版使用 CLI 启动本地助手；协议不绑定 CLI，后续桌面壳可复用。
- Mock 只证明合同，真实平台能力继续标记为 `未验收`。

## 2. Phase 0：规格收敛

- [x] 将 PinchTab 方案改为多平台本地 Browser Bridge SPEC。
- [x] 更新调研 outline/fields，纳入凭据驻留、执行位置和多账号隔离。
- [x] 明确不再扩建登录截图、SSE screencast 和坐标交互。
- [x] 删除未实现的 PinchTab Red 测试，换成本地 Bridge 合同测试。

## 3. Phase 1：Shared 合同（Red → Green）

### Red

- [x] Adapter 覆盖当前平台注册项。
- [x] 不支持的平台明确拒绝。
- [x] Profile 路径按平台和账号隔离并阻止路径穿越。
- [x] Cookie 导出只保留允许域名和名称。
- [x] 状态机拒绝非法流转。

### Green

- [x] 新增 `packages/shared/src/browser-authorization.ts`。
- [x] 收敛登录 URL、Cookie 名称和域名规则到声明式 Adapter。
- [x] 从 shared index 导出稳定合同。

验收：

```bash
pnpm vitest run tests/unit/shared/browser-authorization.test.ts
```

## 4. Phase 2：数据库会话（Red → Green）

### Red

- [x] BrowserSession 支持组织、Provider、Token、过期、领取、完成和取消字段。
- [x] 迁移合同包含必要索引，不删除历史表或字段。

### Green

- [x] 增量修改 Prisma schema。
- [x] 新增可重放 migration。
- [x] 运行 `pnpm db:generate`。

验收：

```bash
pnpm db:generate
pnpm vitest run tests/integration/database/schema.contract.test.ts
```

## 5. Phase 3：API Bridge 协议（Red → Green）

### Red

- [x] 开始接口返回 `202 waiting_local_bridge` 且不访问 browser-runner。
- [x] 15 秒内重复开始复用会话。
- [x] 跨组织状态和取消请求返回 404。
- [x] Bridge Token 无效、过期、取消、重复消费均被拒绝。
- [x] 完成后 Cookie 被加密保存且响应不泄漏明文。
- [x] 错误和取消清除 Token 哈希。

### Green

- [x] 新增本地 Bridge 会话领域服务。
- [x] 改写现有 browser-login start/status/cancel。
- [x] 覆盖取消失败路径，弹窗内显示错误且不提前关闭。
- [x] 新增 Bridge claim/complete/error 端点。
- [x] 写入关键授权 AuditLog。
- [x] 删除登录路径对进程内 `browser-login-session` Map 的依赖。

验收：

```bash
pnpm test:integration -- tests/integration/api/browser-login.test.ts
pnpm test:integration -- tests/integration/api/account-auth-expired.test.ts
```

## 6. Phase 4：本地 Bridge CLI（Red → Green）

### Red

- [x] CLI 参数缺失时返回稳定错误。
- [x] 系统 Chrome 启动参数使用账号独立 Profile。
- [x] 非允许域名重定向终止授权。
- [x] 只序列化 Adapter 白名单 Cookie。
- [x] API 返回取消或过期时关闭浏览器。

### Green

- [x] 新增 `apps/browser-bridge` workspace。
- [x] 使用 `playwright-core` 的系统 Chrome channel，不下载 Chromium。
- [x] 保留 `pnpm browser-bridge:login` 作为开发诊断命令，不向正式用户展示。
- [x] 记录无敏感信息的阶段日志和恢复提示。

验收：

```bash
pnpm vitest run tests/unit/browser-bridge
pnpm --filter @ai-growth-ops/browser-bridge typecheck
```

## 7. Phase 5：Web 切换（Red → Green）

### Red

- [x] 展示等待本地助手状态和启动命令。
- [x] 支持协议唤起、安装入口、等待用户、成功、错误、过期和取消。
- [x] 不再请求 screencast ticket 或发送坐标动作。
- [x] pending 期间只禁用触发按钮。

### Green

- [x] 更新 integrations API 类型。
- [x] 简化 `BrowserLoginDialog`，删除二维码、截图、SSE 和远程输入 UI。
- [x] 登录成功后刷新平台账号列表。

验收：

```bash
pnpm test:web -- tests/web/unit/browser-login-dialog.test.tsx
```

## 8. Phase 6：清理与回归

- [x] 删除 API 登录 screencast ticket/stream/interact 路由。
- [ ] 删除 browser-runner 仅服务登录的 session routes/session-manager；确认发布和采集无调用方后再删除。
- [x] 删除 PinchTab 测试与配置草案。
- [x] 更新 `.env.example`、部署文档和能力矩阵。
- [ ] 保留 legacy 数据和迁移，不删除历史表/字段。

验收：

```bash
pnpm typecheck
pnpm lint
pnpm test:architecture
pnpm test:unit
pnpm test:web
```

## 9. Phase 7：真实平台验收

需要用户在本地 Chrome 人工扫码；不自动发布、评论或私信。

- [ ] 抖音扫码及二次验证完成。
- [ ] 本地 Profile 重启后仍可识别登录态。
- [ ] 两个账号 Profile 不串号。
- [ ] API 重启后授权会话状态仍可恢复。
- [ ] 阿里云节点执行只读健康检查，确认 Cookie 是否可迁移。
- [ ] 记录时间、账号、会话 ID、脱敏证据和失败恢复过程。

完成前能力保持 `未验收`；若 Cookie 不可迁移，下一阶段增加本地执行队列，不伪装成云端可用。

## 10. 发布门禁

```bash
pnpm vitest run tests/unit/shared/browser-authorization.test.ts
pnpm vitest run tests/unit/browser-bridge
pnpm test:integration -- tests/integration/api/browser-login.test.ts
pnpm test:integration -- tests/integration/api/account-auth-expired.test.ts
pnpm test:web -- tests/web/unit/browser-login-dialog.test.tsx
pnpm typecheck
pnpm lint
pnpm test:architecture
```

未运行或失败的命令必须在交付报告中列明。

## 增补：浏览器助手安装包（2026-10-22）

- [x] 单元测试：`mergeTrustedOrigins`（env+内置合并去重）、`assistantNotification`（不泄露 Token）
- [x] `config.ts`：Origin 合并、通知文案；`index.ts` 读取安装包内置 `trusted-origins.conf`
- [x] `runner.ts`：`BROWSER_ASSISTANT_NOTIFY=1` 时关键状态系统通知
- [x] `scripts/build-browser-assistant.sh`：esbuild 自包含 bundle + Swift URL Scheme 壳 + ad-hoc 签名 + zip + sha256
- [x] `.env`/`.env.example`：`BROWSER_ASSISTANT_DOWNLOAD_URL`、`BROWSER_ASSISTANT_TRUSTED_ORIGINS` 说明
- [x] 验收：zip 经 Web 下载 206；`open aigrowthops://authorize?...` 唤起 .app 并完成领取/回传（本机 Profile 复用态验证 `logged_in`）
- [ ] 待办：Apple Developer ID 正式签名与公证；全新 Profile（未登录态）走安装包完成一次真实扫码

## 增补：安装包运行时与启动反馈修复（2026-10-22）

前置：线上 `assistant-v0.1.0-202610221116` 包内置 Homebrew node 单文件，缺 `libnode.137.dylib`，任何机器上拉起即 dyld 崩溃且零反馈。

- [x] Red：`tests/unit/browser-bridge/runner.test.ts` — claim 网络失败时必须发出 failed 系统通知（当前 claim 在 try/catch 外，测试应先红）
- [x] Green：`runner.ts` 将 claim/Adapter/Profile 创建纳入失败通知 try/catch
- [x] `scripts/build-browser-assistant.sh`：改用官方 node 发行版 `bin/+lib/` 布局（默认 universal，SHA-256 校验，缓存 `release/node-distro/`），构建后 `node -v` 冒烟门禁
- [x] Swift 壳：无 URL 双击启动 2 秒后发通知退出；子进程 5 秒窗口内异常退出发兜底通知并把 stderr 落 `assistant.log`
- [x] `apps/browser-bridge/package.json` 版本 0.1.0 → 0.1.1
- [ ] 验收命令：
  ```bash
  pnpm vitest run tests/unit/browser-bridge
  BROWSER_ASSISTANT_TRUSTED_ORIGINS=https://growth.puppyfront.com pnpm assistant:build
  release/BrowserAssistant.app/Contents/Resources/node-runtime/bin/node -v
  open 'aigrowthops://authorize?api=https://growth.puppyfront.com&session=smoke&token=smoke'   # 应出现失败通知而非无反应
  pnpm typecheck && pnpm lint
  ```
- [ ] 重新 `pnpm assistant:release`（需操作员确认后执行）并更新交付状态
