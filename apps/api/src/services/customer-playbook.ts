export {
  generateCustomerPlaybook,
  getLatestCustomerPlaybook,
  approveCustomerPlaybook,
  updateCustomerPlaybook,
  listCustomerFollowUps
} from '@ai-growth-ops/database';

export async function enqueueCustomerPlaybookGenerate(
  customerId: string,
  organizationId: string
): Promise<void> {
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
