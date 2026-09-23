# 数据库安装与已有数据升级

## 本轮发现与修复

原迁移链在 `20260902150000_customer_entity` 引用 `organizations` 时失败：仓库缺少组织、权限、工作流等前置结构的迁移。新增 `20260901000000_restore_platform_baseline` 恢复这些前置结构；名称用于插入依赖顺序，实际修复发生于本轮交付整理。原有迁移文件未改写。

新增 `20260921000000_align_guard_index` 统一 PostgreSQL 截断后的索引名与 Prisma 模型。验证必须包含空库完整重放和最终 schema diff，不能用 `db push` 成功替代。

## 全新安装

确认目标是全新数据库，设置数据库连接与管理员密码后，执行：

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:deploy
pnpm db:seed
```

禁止在生产执行 `db:reset:test`、`prisma migrate reset` 或 `db push --accept-data-loss`。

## 已有数据库：必须先演练，当前未验收

补齐脚本会主动拒绝有旧 User 数据或已有 organizations 表的目标，避免猜测组织归属、覆盖历史结构或丢弃 mock 数据。该拒绝是升级前置条件，不要删除保护来强行执行。

1. 暂停业务写入、队列消费和定时任务，备份数据库、上传文件以及 TOKEN_ENCRYPTION_KEY；记录备份位置、校验值、行数与版本。
2. 将备份恢复到独立暂存数据库；只读核对 `_prisma_migrations` 与实际 schema。区分“旧版本迁移库”和“曾经用 db push 建成的库”。
3. 对旧版本库：制定组织归属回填表，先增加可空列并回填，验证每条来源、发布、互动、客户关联后再加 NOT NULL/FK；退役枚举值必须给出明确映射，不能默默丢弃。
4. 对完整但缺迁移记录的库：对比当前模型及迁移自定义约束，尤其 customer_playbooks 的两个部分唯一索引；逐一证明每个迁移效果已经存在后，才能在副本上 `prisma migrate resolve --applied <已核实的迁移名>`。不得批量标记尚未实现的结构。
5. 副本升级后，比较升级前后每张业务表行数、客户与线索关联、去重约束、外部同步映射和密钥解密；运行 CRM 回归。演练恢复原备份并记录耗时。
6. 将实际副本差异整理为专属升级 SQL、回滚步骤和预计停机窗口，通过交付审核后再用于生产。当前没有对业务数据库执行这些步骤。

## 可重复的测试库验证

```sh
node --test scripts/test-database-url.test.mjs
pnpm db:reset:test
node scripts/with-e2e-database.mjs pnpm prisma migrate diff --from-schema-datasource packages/database/prisma/schema.prisma --to-schema-datamodel packages/database/prisma/schema.prisma --exit-code
pnpm test
```

这里只允许精确名为 `ai_growth_ops_e2e` 的数据库。schema diff 为 0 只证明 Prisma 可表达的结构一致；部分唯一索引和数据回填仍需单独检查。
