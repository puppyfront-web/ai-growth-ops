# 45. 路由工具箱（route-kit）与文件尺寸守卫 SPEC

> 状态：已实施（2026-11-03）
> 关联：架构评审 P1-2（API 层收敛第一步，为拆解 routes.ts 6900 行巨文件铺路）
> 现状：`sendJson` 在 routes.ts + 15 个领域文件复制 16 份；`Route/RouteContext` 类型每文件重复声明；`canAccess` 3+ 份拷贝、2 种权限写法并存；无组合机制（鉴权+校验样板 ×294 路由）；无文件尺寸约束（AI 维护者的上下文粒度）。

## 1. 目标

- G1 `apps/api/src/route-kit.ts`：唯一来源导出 `Route`/`RouteContext`/`sendJson`/`canAccess`；`AppError(status, code, message)`；`defineRoute({ method, pattern, permission?, bodySchema?, querySchema?, handler })` 工厂——封装 getOrganizationContext+401、权限+403、validateBody/Query+400（错误形状与现状一致）、AppError/异常统一映射。
- G2 15 个 `routes-*.ts` 全部迁移为从 route-kit 导入（删除本地拷贝），路由行为零变化；`routes.ts` 主文件本批不动（守卫冻结其增长）。
- G3 示范采用 defineRoute：routes-follow-ups、routes-notifications 的处理器改用工厂（后续新路由一律用 kit）。
- G4 文件尺寸守卫（tests/unit/harness/file-size-guard.test.ts）：`apps/*/src`、`packages/*/src` 下 ts/tsx ≤800 行；存量超限文件进入冻结清单（断言不得增长）；新文件一律受限。

## 2. 非目标

- 本批不拆 routes.ts（后续按域逐批拆）；不改既有路由的响应语义/错误文案；不引入 HTTP 框架。

## 3. 验收

| 场景 | 层级 | 验收 |
|---|---|---|
| 守卫：超限新文件被拒 | unit | 构造 >800 行临时文件断言失败（或以冻结清单断言实现） |
| 守卫：冻结文件不得增长 | unit | 清单内文件行数 ≤ 冻结值 |
| 迁移零回归 | 集成 | 全量 integration 套件通过 |
| defineRoute 组合 | 集成 | notifications 401/200、follow-ups 权限路径行为不变 |
