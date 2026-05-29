import { Worker, WorkerOptions, Job } from 'bullmq';
import { getQueue, QUEUE_NAMES, QueueName } from './queue.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const workerOptions: WorkerOptions = {
  connection: { url: REDIS_URL },
  concurrency: 5,
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
