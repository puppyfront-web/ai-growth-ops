export {
  refreshCustomerProfile,
  loadIcpConfig,
  saveIcpConfig
} from '@ai-growth-ops/database';

export async function enqueueCustomerProfileRefresh(
  customerId: string,
  organizationId: string,
  userId?: string
): Promise<void> {
  const { Queue } = await import('bullmq');
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const queue = new Queue('customer.profile.refresh', {
    connection: { url: redisUrl }
  });
  try {
    await queue.add(
      'customer.profile.refresh',
      { customerId, organizationId, userId },
      { attempts: 2, backoff: { type: 'exponential', delay: 5000 } }
    );
  } finally {
    await queue.close();
  }
}
