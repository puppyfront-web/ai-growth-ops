# 48. browser-runner DOM 兜底提取器回归夹具 Plan

> 关联：[47_SPEC](./47_runner_DOM兜底提取器回归夹具_SPEC.md) | 方式：SDD + TDD | 状态：进行中

| 切片 | 测试先行 | 产出 |
|---|---|---|
| S1 夹具测试（Red：导出缺失） | `tests/unit/browser-runner/dom-extract.test.ts` | — |
| S2 导出 | S1 | `assist-routes.ts` 两个函数加 export |
| S3 验证 | S1/S2 | chromium 来自根 devDep `@playwright/test`（复用其浏览器二进制），模块级共享 browser 实例 |

验收：`corepack pnpm vitest run tests/unit/browser-runner/dom-extract.test.ts` + unit 全量 + typecheck/lint。
