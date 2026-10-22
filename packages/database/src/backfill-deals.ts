import type { DatabaseClient } from './client.js';
import { ensureDealForOutcome } from './lifecycle.js';

/**
 * Creates one outcome Deal for every won/lost Customer that predates the
 * closed-loop migration. Safe to run repeatedly: existing Deals win.
 */
export async function backfillClosedLoop(
  db: DatabaseClient
): Promise<{ customers: number; dealsCreated: number }> {
  const customers = await db.customer.findMany({
    where: {
      status: { in: ['won', 'lost'] },
      deletedAt: null
    },
    select: {
      id: true,
      organizationId: true,
      userId: true,
      displayName: true,
      channel: true,
      status: true
    }
  });

  let dealsCreated = 0;
  for (const customer of customers) {
    const outcome = customer.status === 'won' ? 'won' : 'lost';
    const created = await db.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${`backfill:${customer.organizationId}:${customer.id}`})
        )
      `;
      const result = await ensureDealForOutcome(tx, {
        organizationId: customer.organizationId,
        userId: customer.userId,
        customer: {
          id: customer.id,
          displayName: customer.displayName,
          channel: customer.channel
        },
        outcome,
        source: 'closed_loop_backfill'
      });
      if (!result.created) return false;

      await tx.deal.update({
        where: { id: result.dealId! },
        data: {
          metadata: {
            lifecycleSource: 'closed_loop_backfill',
            backfillVersion: 1
          } as never
        }
      });

      await tx.lead.updateMany({
        where: {
          customerId: customer.id,
          organizationId: customer.organizationId,
          deletedAt: null,
          status: { notIn: ['WON', 'LOST', 'INVALID'] }
        },
        data: { status: outcome === 'won' ? 'WON' : 'LOST' }
      });

      return true;
    });
    if (created) dealsCreated += 1;
  }

  return { customers: customers.length, dealsCreated };
}
