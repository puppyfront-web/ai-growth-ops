# 采集会话持久 Profile Plan

对应 SPEC：`spec/18_采集会话持久Profile_SPEC.md`

| # | 任务 | 文件 | 验收命令 |
| --- | --- | --- | --- |
| T1 | Red：`sanitizeCrawlProfileKey` / `crawlProfileDirectory` / 持久分支路由单测 | `tests/unit/browser-runner/browser-session.test.ts` | 先确认失败 |
| T2 | Green：Profile 路径纯函数 + `createCrawlSession`（持久实例缓存、引用计数、空闲 TTL） | `apps/browser-runner/src/browser-session.ts` | 单测通过 |
| T3 | 路由透传：三个 assist 接口 body 增加可选 `profileKey`，`createSession` 封装路由分流 | `apps/browser-runner/src/assist-routes.ts` | typecheck |
| T4 | worker 传参：`crawlSearchQueryComments` 增加 `profileKey`，执行处传 `<platform>-<accountId>` | `packages/database/src/prospecting.ts` | typecheck |
| T5 | 部署配置：browser-runner 增加可写 Profile 卷 + `BROWSER_RUNNER_PROFILE_DIR`，文档补充 | `docker-compose.prod.yml`、`docs/deployment.md` | compose config 校验 |

依赖：T1→T2→T3/T4 并行→T5。
