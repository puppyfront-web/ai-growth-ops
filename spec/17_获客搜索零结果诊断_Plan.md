# 获客搜索零结果诊断 Plan

对应 SPEC：`spec/16_获客搜索零结果诊断_SPEC.md`

## 任务拆分（先测试后实现）

### T1 共享警告纯函数（Red → Green）

- 文件：`packages/shared/src/prospect-warning.ts`（新）；`packages/shared/src/index.ts` 导出。
- `buildZeroResultWarning(input: { totalComments; totalCandidates; skippedDuplicates; searchEmptyReasons?: string[] }): string | undefined`
- 测试：`tests/unit/shared/prospect-zero-warning.test.ts`
- 验收：`pnpm vitest run tests/unit/shared/prospect-zero-warning.test.ts`

### T2 browser-runner 搜索分类与合并纯函数（Red → Green）

- 文件：`apps/browser-runner/src/assist-routes.ts`
  - `_SEARCH_API_PATTERNS` 改为 `SEARCH_API_PATTERNS` 并使用。
  - 导出 `classifySearchEmptyReason(signals)` 与 `mergeSearchResults(dom, api)`。
- 测试：`tests/unit/browser-runner/search-diagnostics.test.ts`
- 验收：`pnpm vitest run tests/unit/browser-runner/search-diagnostics.test.ts`

### T3 browser-runner `runKeywordVideoSearch` 接入诊断（Green）

- 注册/注销 response 监听拦截搜索 XHR（复用 `parseJsonBigInt` + `extractSearchResults`）。
- 空结果时采集页面信号（容器存在性、可见登录弹层）→ 分类 → 响应带 `reasonCode`/`message`；容器缺失时重试一次。
- 输出 `[search] …` 诊断日志。

### T4 database/prospecting 传播原因（Green）

- `crawlSearchQueryComments` 返回值携带空搜索原因（不改对外类型签名的地方用出参对象）。
- `executeProspectingTask` 汇总原因，`metadata.searchEmptyReasons`，警告改用 `buildZeroResultWarning`。

### T5 Verify

- `pnpm typecheck`、`pnpm lint`
- `pnpm vitest run tests/unit/shared/prospect-zero-warning.test.ts tests/unit/browser-runner/search-diagnostics.test.ts tests/unit/browser-runner/search-extract.test.ts`

## 依赖与风险

- T1/T2 无相互依赖可并行；T3 依赖 T2；T4 依赖 T1。
- `/assist/search-videos` 响应为新增可选字段，旧 API 调用方向后兼容；旧 runner + 新 worker 走 `SEARCH_UNKNOWN` 兜底旧文案。
- 不触碰迁移、权限与组织隔离。
