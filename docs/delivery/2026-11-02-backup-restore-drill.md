# 本地备份恢复演练记录（2026-11-02）

> 范围：开发式部署布局（dev compose + 宿主机进程 + localhost:5432 容器库）
> 结论：**通过**。备份产物完整、校验和复核一致、隔离库恢复后数据与源库完全一致。
> 关联：[crm-release-status.md](./crm-release-status.md) 运维恢复条目、[local-first-data-boundary.md](./local-first-data-boundary.md)

## 1. 演练前修复（根因）

演练前 `pnpm local:backup` 在本机直接失败：`Error: Unable to inspect running services`。根因：备份/恢复脚本硬绑 `docker-compose.prod.yml`，在开发式布局（postgres/redis/minio 容器 + 宿主机 API/Worker/Web 进程）下不可用；同时默认 `LOCAL_DATA_DIR`（`.local-data`）不存在时脚本直接抛错。

修复（`scripts/local-data-utils.mjs`、`backup-local-data.mjs`、`restore-local-data.mjs`）：

1. 新增 `parseDatabaseUrl` / `matchPostgresContainer` 纯函数（附 node:test 单测，5 例通过，已接入 `pnpm test`）；
2. 新增 `resolvePostgresAccess`：生产 compose 有运行中的 postgres → 原路径（行为不变）；否则按 `DATABASE_URL` 端口在 `docker ps` 定位 postgres 容器，`docker exec` 执行 pg_dump/psql；
3. container 模式不停任何服务（pg_dump 自身事务一致）；数据目录不存在时自动创建；`--confirm` 破坏性门禁保持。

## 2. 演练步骤与证据

### 2.1 备份

```
$ node --env-file-if-exists=.env scripts/backup-local-data.mjs
Backup created: .local-data/backups/2026-11-02T14-34-58-061Z   # 耗时 0.73s
```

产物：`database.sql.gz`（130 KB）、`files.tar.gz`（uploads/objects/secrets）、`manifest.json`（formatVersion 2，含 sha256 校验和）。

### 2.2 校验和复核

manifest 中 `database.sql.gz`/`files.tar.gz` 的 sha256 与实际文件逐一复核一致（恢复脚本内建的 `verifyFile` 逻辑同源）。

### 2.3 隔离库恢复（不触碰业务库）

```
CREATE DATABASE ai_growth_ops_restore_drill;
gunzip -c database.sql.gz | docker exec -i ai-growth-ops-postgres \
  psql -v ON_ERROR_STOP=1 -U postgres -d ai_growth_ops_restore_drill
# 退出码 0，641 行 DDL/DML 完整回放（结尾 REVOKE）
```

### 2.4 数据一致性比对

| 项目 | 源库 | 演练库 | 结果 |
|---|---|---|---|
| public 表数量 | 77 | 77 | ✓ |
| "User" | 5 | 5 | ✓ |
| organizations | 5 | 5 | ✓ |
| platform_accounts | 4 | 4 | ✓ |
| customers | 3 | 3 | ✓ |
| leads / deals | 0 / 0 | 0 / 0 | ✓ |
| prospecting_tasks | 4 | 4 | ✓ |
| prospect_candidates | 169 | 169 | ✓ |
| publish_jobs / interactions / notifications | 2 / 7 / 1 | 2 / 7 / 1 | ✓ |

文件类数据：`files.tar.gz` 解包后逐文件 sha256 与源目录一致（uploads/eea0f213….png）。

### 2.5 清理

演练库 `DROP DATABASE`、临时目录/日志删除，业务库全程未受影响。

## 3. 已知边界（如实）

1. **Redis 队列态不在备份范围**——BullMQ 作业/定时器状态丢失后由调度器与孤儿恢复机制重建，属可接受损失；
2. **dev 布局下 minio 对象数据在 docker 卷（`ai-growth-ops_minio-data`），不在 `LOCAL_DATA_DIR`**，本次备份未覆盖——生产 compose 布局通过 bind mount 覆盖；dev 布局用户如使用对象存储需另行备份该卷（后续批次处理）；
3. 生产 compose 布局的全量恢复（含停机编排）未在本机演练，待真实部署环境执行；
4. 备份无自动轮转策略，长期运行需手工清理 `.local-data/backups/`。

## 4. Runbook

```bash
# 备份（dev 布局与生产布局通用）
corepack pnpm local:backup          # 即 node --env-file-if-exists=.env scripts/backup-local-data.mjs

# 恢复（破坏性：会重置 DATABASE_URL 指向的库，需二次确认）
corepack pnpm local:restore -- .local-data/backups/<时间戳> --confirm

# 验证产物
shasum -a 256 <备份目录>/*.gz       # 与 manifest.json 比对
```

建议频率：每日业务收尾后执行一次；重大变更（迁移、批量导入）前后各一次。
