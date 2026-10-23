# 恢复第 1 代扫码登录(弹出浏览器窗口)SPEC

## 背景

产品定位调整为部署到用户本地机器(办公室/个人设备)。登录方案的完整演进链中,第 1 代(commit `8e8ade0` 及初始提交,`chromium.launch({ headless: false })` + 状态轮询弹窗)的前提是"用户和 browser-runner 在同一台机器"——本地部署下该前提重新成立,后续各代(二维码截图/远程交互/screencast/浏览器助手)为云端场景引入的复杂度不再需要。浏览器助手链路保留不删,仅不再是默认。

## 目标

1. 恢复第 1 代交互:browser-runner 以有头模式启动 Chromium,在用户机器上弹出真实浏览器窗口展示完整平台登录页,用户在窗口内扫码并完成验证方式选择/短信验证码;Web 弹窗只展示状态与倒计时。
2. 显示环境自适应:`hasDisplaySupport()` 为真(用户机器直跑)→ 有头窗口;无显示服务(无 DISPLAY 容器)→ 自动降级为无头 + 登录页截图,Web 弹窗内展示二维码。`/session/start` 响应新增 `headed` 字段告知前端当前模式。
3. API `/api/accounts/:id/qr-login/*` 三个路由(start/status/cancel);登录成功后 Cookie 走既有 `validatePlatformCookie → encryptToken → cookieRef` 链路,明文不回传前端;组织隔离 + `settings:manage` 权限;并发 start 合并(StrictMode 双挂载/双击)。
4. 助手相关代码与 `/api/browser-bridge/sessions/*`、`/api/accounts/:id/browser-login/*` 保持原样可用。

## 非目标

- 不删除/不修改浏览器助手及其 API。
- 不引入截图转发、远程交互、screencast(第 2~4 代能力)。

## 测试矩阵

- 单元 `tests/unit/browser-runner/session-manager.test.ts`:有显示→有头弹窗;无显示→无头降级 + `headed` 标记。
- Web 单元 `tests/web/unit/browser-login-dialog.test.tsx`:窗口模式提示、降级二维码展示、轮询成功态、关闭取消、启动失败可恢复。
- 集成 `tests/integration/api/qr-login.test.ts`(恢复自 `9fd8cd2^` 的 browser-login 测试):六平台登录流程、Cookie 加密入库、明文不泄漏、取消、错误处理、runner 不可达、并发 start 合并。

## 验收

- `pnpm typecheck`、`pnpm lint`、全量单测、Web 测试、qr-login 与 browser-login(助手)集成测试全部通过。
- API 路由清单与 HEAD diff 仅多出 3 个 qr-login 路由,零丢失。
- 首次部署后按 runbook 做一次真实扫码验收(含"扫码后选择验证方式"路径)。
