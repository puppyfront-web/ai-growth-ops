#!/usr/bin/env node
/**
 * 清理 _prisma_migrations 中的重复/失败记录。
 * 用于移除已删除的 20260902152300_customer_entity 及 rolled_back 幽灵行。
 *
 * 用法: node scripts/prune-migration-ghosts.mjs
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const before = await db.$queryRaw`
    SELECT migration_name, finished_at, rolled_back_at
    FROM _prisma_migrations
    ORDER BY started_at
  `;

  console.log(`迁移记录: ${before.length} 条`);

  const removed52300 = await db.$executeRaw`
    DELETE FROM _prisma_migrations
    WHERE migration_name = '20260902152300_customer_entity'
  `;

  const removedGhosts = await db.$executeRaw`
    DELETE FROM _prisma_migrations
    WHERE rolled_back_at IS NOT NULL AND finished_at IS NULL
  `;

  const after = await db.$queryRaw`
    SELECT migration_name, finished_at
    FROM _prisma_migrations
    ORDER BY started_at
  `;

  console.log(`已删除 52300 重复迁移: ${removed52300} 条`);
  console.log(`已删除 rolled_back 幽灵记录: ${removedGhosts} 条`);
  console.log(`清理后: ${after.length} 条`);
  after.forEach((row) => console.log(`  - ${row.migration_name}`));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
