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
import { QUEUE_NAMES } from './queue.js';

const logger = createLogger('worker');
import { registerWorker, closeAllWorkers } from './worker.js';
import { handleInteractionSyncComments } from './job-handlers/interaction.sync-comments.js';
import { handleInteractionSyncMessages } from './job-handlers/interaction.sync-messages.js';
import { handlePublishExecute } from './job-handlers/publish.execute.js';
import { handleLeadSyncFeishuBitable } from './job-handlers/lead.sync.feishu-bitable.js';
import { handleLeadSyncWeComContact } from './job-handlers/lead.sync.wecom-contact.js';
import { handleResearchRun } from './job-handlers/research.run.js';
import { handleScheduledChecker } from './job-handlers/scheduled-checker.js';
import { handleCampaignExecute } from './job-handlers/campaign.execute.js';
import { handleCampaignCheckSchedule } from './job-handlers/campaign.check-schedule.js';
import { handleInteractionAutoReply } from './job-handlers/interaction.auto-reply.js';
import { handleInteractionManualReply } from './job-handlers/interaction.manual-reply.js';
import { handleScheduledInteractionSync } from './job-handlers/scheduled.interaction-sync.js';
import { handleWorkflowExecute } from './job-handlers/workflow.execute.js';
import { startScheduler, SCHEDULED_QUEUE, CAMPAIGN_CHECK_QUEUE, INTERACTION_SYNC_QUEUE } from './scheduler.js';

export const appName = 'worker';
export const getWorkerHealth = () => createHealthSnapshot(appName);

// All real handlers — one per active queue
const realHandlers: Record<string, (job: any) => Promise<void>> = {
  [QUEUE_NAMES.INTERACTION_SYNC_COMMENTS]: handleInteractionSyncComments,
  [QUEUE_NAMES.INTERACTION_SYNC_MESSAGES]: handleInteractionSyncMessages,
  [QUEUE_NAMES.PUBLISH_EXECUTE]: handlePublishExecute,
  [QUEUE_NAMES.LEAD_SYNC_FEISHU]: handleLeadSyncFeishuBitable,
  [QUEUE_NAMES.LEAD_SYNC_WECOM]: handleLeadSyncWeComContact,
  [QUEUE_NAMES.RESEARCH_RUN]: handleResearchRun,
  [QUEUE_NAMES.CAMPAIGN_EXECUTE]: handleCampaignExecute,
  [QUEUE_NAMES.INTERACTION_AUTO_REPLY]: handleInteractionAutoReply,
  [QUEUE_NAMES.INTERACTION_MANUAL_REPLY]: handleInteractionManualReply,
  [QUEUE_NAMES.SCHEDULED_INTERACTION_SYNC]: handleScheduledInteractionSync,
  [QUEUE_NAMES.WORKFLOW_EXECUTE]: handleWorkflowExecute,
  [SCHEDULED_QUEUE]: handleScheduledChecker,
  [CAMPAIGN_CHECK_QUEUE]: handleCampaignCheckSchedule,
};

export async function startWorker(): Promise<void> {
  initSkills();
  logger.info('Starting worker...');

  // Register only real handlers — no placeholders, no stub queues
  for (const [key, queueName] of Object.entries(QUEUE_NAMES)) {
    const handler = realHandlers[queueName];
    if (!handler) {
      logger.error(`No handler for queue ${queueName} — skipping`);
      continue;
    }
    registerWorker(queueName, handler);
    logger.info(`Registered worker for ${queueName}`);
  }

  logger.info(`${Object.keys(QUEUE_NAMES).length} workers registered`);

  // Start the scheduler for periodic tasks
  await startScheduler();

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
