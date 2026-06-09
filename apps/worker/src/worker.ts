import { Worker, WorkerOptions, Job } from 'bullmq';
import { getQueue, QUEUE_NAMES, QueueName } from './queue.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Transient errors that should trigger a retry rather than permanent failure
const TRANSIENT_ERROR_MESSAGES = [
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'connect ETIMEDOUT',
  'Connection terminated',
  'Connection refused',
  'Can\'t reach database server',
  'P1001', // Prisma: Can't reach database
  'P1002', // Prisma: Database timeout
  'P1008', // Prisma: Operations timed out
  'P1017', // Prisma: Server closed connection
];

export function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT_ERROR_MESSAGES.some(t => msg.includes(t));
}

const workerOptions: WorkerOptions = {
  connection: { url: REDIS_URL },
  concurrency: 5,
  lockDuration: 120_000, // 2 min — long enough for browser operations
};

const workers: Worker[] = [];

export function registerWorker(
  queueName: QueueName,
  handler: (job: Job) => Promise<void>,
): Worker {
  const worker = new Worker(queueName, handler, workerOptions);

  worker.on('completed', (job) => {
    console.log(`[worker] Job ${job.id} completed on ${queueName}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[worker] Job ${job?.id} failed on ${queueName}: ${err.message}`);
  });

  worker.on('error', (err) => {
    console.error(`[worker] Worker error on ${queueName}: ${err.message}`);
  });

  workers.push(worker);
  return worker;
}

export async function closeAllWorkers(): Promise<void> {
  await Promise.all(workers.map(w => w.close()));
  console.log(`[worker] All ${workers.length} workers closed`);
}
