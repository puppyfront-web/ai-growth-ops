import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

// Load .env from monorepo root
(function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '..', '..', '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
})();

import { createHealthSnapshot } from '@ai-growth-ops/shared';
import { createLogger } from '@ai-growth-ops/observability';
import { initSkills } from '@ai-growth-ops/skills';
import { getQueue, QUEUE_NAMES } from './queue.js';

const logger = createLogger('worker');
import { registerWorker, closeAllWorkers, createPlaceholderHandler } from './worker.js';
import { handleInteractionSyncComments } from './job-handlers/interaction.sync-comments.js';
import { handleInteractionSyncMessages } from './job-handlers/interaction.sync-messages.js';
import { handlePublishExecute } from './job-handlers/publish.execute.js';
import { handleInteractionClassify } from './job-handlers/interaction.classify.js';
import { handleInteractionSuggestReply } from './job-handlers/interaction.suggest-reply.js';
import { handleLeadSyncFeishuBitable } from './job-handlers/lead.sync.feishu-bitable.js';
import { handleLeadSyncWeComContact } from './job-handlers/lead.sync.wecom-contact.js';
import { handleResearchRun } from './job-handlers/research.run.js';

export const appName = 'worker';
export const getWorkerHealth = () => createHealthSnapshot(appName);

// Real handler overrides for queues with implemented logic
const realHandlers: Partial<Record<string, (job: any) => Promise<void>>> = {
  [QUEUE_NAMES.INTERACTION_SYNC_COMMENTS]: handleInteractionSyncComments,
  [QUEUE_NAMES.INTERACTION_SYNC_MESSAGES]: handleInteractionSyncMessages,
  [QUEUE_NAMES.PUBLISH_EXECUTE]: handlePublishExecute,
  [QUEUE_NAMES.INTERACTION_CLASSIFY]: handleInteractionClassify,
  [QUEUE_NAMES.INTERACTION_SUGGEST_REPLY]: handleInteractionSuggestReply,
  [QUEUE_NAMES.LEAD_SYNC_FEISHU]: handleLeadSyncFeishuBitable,
  [QUEUE_NAMES.LEAD_SYNC_WECOM]: handleLeadSyncWeComContact,
  [QUEUE_NAMES.RESEARCH_RUN]: handleResearchRun,
};

export async function startWorker(): Promise<void> {
  initSkills();
  logger.info('Starting worker...');

  // Register workers — use real handler where available, placeholder otherwise
  for (const [key, queueName] of Object.entries(QUEUE_NAMES)) {
    const handler = realHandlers[queueName] || createPlaceholderHandler(queueName);
    registerWorker(queueName, handler);
    logger.info(`Registered worker for ${queueName}`, { mode: realHandlers[queueName] ? 'real' : 'placeholder' });
  }

  logger.info(`${Object.keys(QUEUE_NAMES).length} workers registered`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    await closeAllWorkers();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Auto-start when run directly
if (process.argv[1]?.includes('worker') && !process.env.VITEST) {
  startWorker().catch(err => {
    logger.error('Failed to start worker', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
