# 获客闭环 P0 交付记录

日期：2026-10-19
关联规格：[spec/08_获客闭环专业化_SPEC.md](../../spec/08_获客闭环专业化_SPEC.md)
关联计划：[spec/09_获客闭环专业化_Plan.md](../../spec/09_获客闭环专业化_Plan.md)
后续路线：[spec/10_获客闭环P1P2_Roadmap_SPEC.md](../../spec/10_获客闭环P1P2_Roadmap_SPEC.md)、[spec/11_获客闭环P1P2_Plan.md](../../spec/11_获客闭环P1P2_Plan.md)

## 1. 本次交付范围

本次只交付 **P0：让获客—跟进—成交闭环可解释**。P1/P2（触达序列、多平台获客、客户合并、多触归因、外部 CRM）没有实现。

已交付：

1. **统一生命周期**
   - Lead / Customer / Deal 的成交、流失结局通过同一领域服务同步。
   - Lead WON/LOST 会同步客户与未关闭商机；Customer WON/LOST 会同步线索与商机；Deal 赢单/输单/重开会反向同步。
   - 同步幂等，重复调用不会重复创建商机。

2. **商机（Deal）**
   - 新增 `deals` / `deal_activities`、`DealStage` 状态机。
   - 支持金额（Decimal 14,2）、预计成交日、负责人、下次动作、来源归因、流失原因、赢单时间。
   - 阶段流转由 `packages/shared/src/lifecycle.ts` 唯一约束。

3. **跟进 SLA**
   - A/B/C 级线索默认 4h / 24h / 72h 首次下一步动作。
   - 主动获客转入客户、评论私信转客户、手工创建客户都会写默认 SLA。
   - 新增 `GET /api/follow-ups/overdue` 统一逾期队列（Lead/Customer/Deal）。
   - 线索分配改为 PATCH，并给被分配人写站内通知；分配给自己或组织外用户不通知。

4. **经营漏斗**
   - 新增 `GET /api/analytics/funnel`，覆盖发布→互动→线索→客户→商机→成交与收入。
   - 新增 `/analytics/funnel` 页面：漏斗、收入、逾期、渠道质量、内容贡献。
   - 内容分析改为展示互动/线索/客户/成交/成交额，而不是只展示发布数。

5. **平台能力矩阵**
   - 新增共享常量 `PLATFORM_CAPABILITIES` 与 `GET /api/platforms/capabilities`。
   - `/integrations` 展示 6 平台能力状态：已验证 / Beta / 未验收 / 不支持。
   - 抖音发布与主动获客标记为已验证；自动回复、互动同步、其他平台保持 Beta/未验收。

6. **UI**
   - 新增 `/deals/pipeline` 商机管道（拖拽阶段、金额、逾期标识）。
   - 客户详情新增“商机”区块，可创建商机、切换阶段、填写金额/预计成交/负责人。
   - 客户与线索详情新增“下次动作 / 截止时间”字段。
   - 工作台新增近 30 天线索、待跟进、成交额、在手 pipeline 四个指标。
   - 导航新增“商机管道”“经营漏斗”。

## 2. 数据库迁移

迁移：`packages/database/prisma/migrations/20261019000000_acquisition_closed_loop/migration.sql`

- 新增 `DealStage`、`deals`、`deal_activities`。
- `leads` 增加 `nextActionAt`、`lastContactedAt`。
- `customers` 增加 `nextAction`、`nextActionAt`、`lastContactedAt`。
- 新增索引：组织 + 阶段/下次动作/赢单时间。
- 回填：`backfillClosedLoop` 为历史 won/lost 客户补齐结局商机，幂等；命令为
  `pnpm db:backfill-deals`（先 `--dry-run` 核对）。

已执行：

```bash
pnpm db:reset:test
node scripts/with-e2e-database.mjs sh -c 'pnpm prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel packages/database/prisma/schema.prisma --exit-code'
# No difference detected.
node scripts/with-e2e-database.mjs pnpm db:backfill-deals --dry-run
# {"dryRun":true,"closedCustomers":0,"deals":0}
```

注意：本地开发库若尚未执行本次迁移，需要先 `pnpm db:deploy`；e2e 库已完成重放。

## 3. 测试证据

### 新增测试

- `tests/unit/shared/lifecycle.test.ts`：18 项（状态映射、SLA、阶段流转）。
- `tests/unit/shared/funnel-analytics.test.ts`：5 项。
- `tests/unit/shared/content-roi.test.ts`：4 项。
- `tests/unit/shared/platform-capabilities.test.ts`：5 项。
- `tests/integration/lifecycle-sync.integration.test.ts`：7 项。
- `tests/integration/backfill-deals.integration.test.ts`：3 项。
- `tests/integration/api/deals.test.ts`：7 项。
- `tests/integration/api/follow-ups-overdue.test.ts`：4 项。
- `tests/integration/api/funnel.test.ts`：3 项。
- `tests/web/unit/deal-pipeline.test.tsx`：3 项。
- `tests/web/unit/customer-deals.test.tsx`：3 项。
- `tests/web/unit/funnel-analytics.test.tsx`：3 项。

### 全量结果

```text
pnpm typecheck       通过（19 个 workspace）
pnpm lint            通过
pnpm test            114 个测试文件 / 765 项通过；Web 21 个文件 / 127 项通过
pnpm build           通过（Web 68+ 路由，API/Worker/Runtime 构建成功）
pnpm test:architecture  通过（8 个既有兼容警告）
```

## 4. 未完成 / 未验收

- **真实平台回复**：仍未完成逐平台低量验收，不能宣称稳定自动回复（验收程序见 [`real-platform-acceptance-runbook.md`](./real-platform-acceptance-runbook.md)）。
- **飞书/企微真实写入**：本次未新增真实验收（Runbook 3.2）。
- ~~E2E 浏览器闭环~~：已补齐——`tests/e2e/flow-deal-close-loop.e2e.test.ts` 覆盖
  潜客→客户→商机→赢单→漏斗→内容分析（Mock 数据），随 P1/P2 交付通过（14/14）。
- **P1**：主动触达序列、多平台主动获客、客户合并、线索补全、培育序列。（已随
  [`2026-10-19-acquisition-p1p2.md`](./2026-10-19-acquisition-p1p2.md) 交付）
- **P2**：多触归因、广告成本、外部 CRM 双向同步、销售预测。（同上；CRM 双向
  连接器已降范围为通用 Webhook）
- **历史数据回填**：脚本已提供，生产执行前需备份并在目标库先跑 dry-run/核对。

## 5. 风险与回滚

- 新增表和可空字段，代码回滚不需要删表。
- 回填只创建缺失商机，可通过 `metadata.lifecycleSource = 'closed_loop_backfill'` 定位。
- 状态同步是幂等的；如发现异常，先停写并回滚代码，再按备份恢复。
- 金额统一 Decimal/字符串，避免浮点误差。

## 6. 上线前仍需人工确认

1. 在隔离的 `LOCAL_DATA_DIR` 执行备份与恢复演练。
2. 为声明支持的平台准备低风险测试账号，完成一次真实回复与飞书写入。
3. 对历史 won/lost 客户执行回填，抽样核对金额、负责人、来源。
4. 业务负责人确认漏斗口径（发生量，非严格 cohort）与逾期 SLA。
