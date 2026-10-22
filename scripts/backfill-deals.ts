import {
  backfillClosedLoop,
  createDatabaseClient
} from '@ai-growth-ops/database';

/**
 * One-off, idempotent backfill: creates outcome Deals for historical won/lost
 * customers that predate the closed-loop migration.
 *
 * Usage:
 *   pnpm db:backfill-deals            # apply
 *   pnpm db:backfill-deals --dry-run  # report only
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const db = createDatabaseClient();
  try {
    if (dryRun) {
      const customers = await db.customer.count({
        where: { status: { in: ['won', 'lost'] }, deletedAt: null }
      });
      const deals = await db.deal.count({ where: { deletedAt: null } });
      console.log(
        JSON.stringify({ dryRun: true, closedCustomers: customers, deals })
      );
      return;
    }
    const result = await backfillClosedLoop(db);
    console.log(JSON.stringify({ dryRun: false, ...result }));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
