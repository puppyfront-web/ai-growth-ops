import {
  convertProspectToCustomer,
  enrichProspectProfile,
  executeProspectingTask,
  markProspectEnrichFailed,
  queueProspectProfileEnrich,
  type DatabaseClient
} from '@ai-growth-ops/database';

export {
  convertProspectToCustomer,
  enrichProspectProfile,
  executeProspectingTask,
  markProspectEnrichFailed,
  queueProspectProfileEnrich
};

export async function enqueueProspectingRun(
  taskId: string,
  organizationId: string,
  userId: string,
  executionToken: string,
  forceRecrawl = false
): Promise<void> {
  const { Queue } = await import('bullmq');
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const queue = new Queue('prospecting.run', {
    connection: { url: redisUrl }
  });
  try {
    await queue.add(
      'prospecting.run',
      { taskId, organizationId, userId, executionToken, forceRecrawl },
      {
        jobId: taskId,
        attempts: 2,
        backoff: { type: 'exponential', delay: 8000 },
        removeOnComplete: true,
        removeOnFail: true
      }
    );
  } finally {
    await queue.close();
  }
}

export async function enqueueProspectingEnrich(
  db: DatabaseClient,
  candidateId: string,
  organizationId: string,
  userId: string
): Promise<void> {
  await queueProspectProfileEnrich(db, candidateId, organizationId);
  const { Queue } = await import('bullmq');
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const queue = new Queue('prospecting.run', {
    connection: { url: redisUrl }
  });
  try {
    await queue.add(
      'prospecting.enrich',
      { candidateId, organizationId, userId },
      {
        jobId: `enrich-${candidateId}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('already exists') || message.includes('Job already')) {
      return;
    }
    await markProspectEnrichFailed(db, candidateId, organizationId, message);
    throw error;
  } finally {
    await queue.close();
  }
}
