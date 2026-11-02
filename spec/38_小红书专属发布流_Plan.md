# 38. 小红书专属发布流 Plan

> 状态：已实施（2026-11-02）
> 关联：[37_小红书专属发布流_SPEC](./37_小红书专属发布流_SPEC.md)
> 原则：先测试后实现（RED → GREEN），单功能切片，不动范围外代码。

## 任务序列

### T1 抽公共媒体挑选模块（前置小重构）

- 新建 `apps/browser-runner/src/media-files.ts`：从 `douyin-publish.ts` 迁出 `pickVideoFile`/`pickImageFiles`（带 `existsSync` 过滤），导出。
- `douyin-publish.ts` 删除本地实现改为 import，行为不变。
- 验收：`pnpm typecheck`。

### T2 RED：失败测试

- 新建 `tests/unit/browser-runner/xhs-publish.test.ts`：
  - 纯函数组：`isXhsUploadCompleteText` / `truncateXhsTitle` / `isXhsPublishSuccessUrl` / 媒体挑选分流与错误文案（SPEC A1–A4）；
  - 路由分发组（A5）：仿 `fetch-messages-route.test.ts`——`vi.doMock` 掉 `xhs-publish.js`（断言被调用 + 返回失败契约），起真实 HTTP server POST `/assist/publish`，`platform: 'xiaohongshu'`。
- 验收：`pnpm vitest run tests/unit/browser-runner/xhs-publish.test.ts` 全部失败（模块不存在）。

### T3 GREEN：实现 `apps/browser-runner/src/xhs-publish.ts`

- 导出：`publishXiaohongshu(input)`、`isXhsUploadCompleteText`、`truncateXhsTitle`、`isXhsPublishSuccessUrl`。
- 结构镜像 `publishDouyin`：`createStealthSession(cookie, 'xiaohongshu.com')` → 打开发布页 → 登录失效检测 → 上传（视频/图文分流，G3 完成判定，deadline 240s）→ 填标题（20 字截断）→ 填正文（清空重打）→ 话题（≤10 个，失败不中断）→ `clickWithVisionFallback` 点发布 → `waitForURL('**/publish/success**')`。
- 全程 `reportPublishProgress` 中文阶段消息（browser_launch/browser_page/browser_fill/browser_submit/done/failed）。
- 错误文案对齐 worker 识别正则（`登录已失效`、`需要.*素材`）。

### T4 接线与清理

- `publish-routes.ts`：
  1. douyin/xiaohongshu 专属分支统一放到通用校验之前；
  2. `PUBLISH_PAGE_URLS`/`PUBLISH_SELECTORS` 移除 xiaohongshu 条目；
  3. 删除通用路径的「XHS 先传图后填文」特判分支。
- 验收：T2 测试全绿；`pnpm typecheck`。

### T5 回归

- `pnpm typecheck`、`pnpm lint`、`pnpm test:unit`——不新增失败。

### T6 交付记录

- 新建 `docs/delivery/2026-11-02-xhs-publish-flow.md`：改动清单、测试证据（命令输出摘要）、未执行真实发布的诚实声明与遗留项。

## 依赖与风险

- T2 依赖 T1（媒体挑选导入路径）；T3 依赖 T2；T4 依赖 T3。
- 风险：上游选择器对应的是 2026-11 小红书创作者中心页面，后续仍可能漂移——视觉兜底与「失败明确报错」是既定缓解；真实有效性以 Runbook 验收为准（不在本任务）。
