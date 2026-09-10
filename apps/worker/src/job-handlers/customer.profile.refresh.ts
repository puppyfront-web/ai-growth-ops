import { Job } from 'bullmq';
import {
  createDatabaseClient,
  refreshCustomerProfile
} from '@ai-growth-ops/database';
import { initSkills } from '@ai-growth-ops/skills';

export interface CustomerProfileRefreshInput {
  customerId: string;
  organizationId: string;
  userId?: string;
}

export async function handleCustomerProfileRefresh(
  job: Job<CustomerProfileRefreshInput>
): Promise<void> {
  initSkills();
  const db = createDatabaseClient();
  const { customerId, organizationId } = job.data;

  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null }
  });
  if (!customer) {
    job.log(`Customer ${customerId} not found, skipping`);
    return;
  }

  const userId = job.data.userId ?? customer.userId;
  const result = await refreshCustomerProfile(
    db,
    customerId,
    organizationId,
    userId
  );

  job.log(
    `Profile refreshed: fit=${result.scores.fitScore} intent=${result.scores.intentScore} segment=${result.scores.segment}`
  );

  const { Queue } = await import('bullmq');
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const queue = new Queue('customer.playbook.generate', {
    connection: { url: redisUrl }
  });
  try {
    await queue.add(
      'customer.playbook.generate',
      { customerId, organizationId },
      { attempts: 2, backoff: { type: 'exponential', delay: 5000 } }
    );
  } finally {
    await queue.close();
  }
}
