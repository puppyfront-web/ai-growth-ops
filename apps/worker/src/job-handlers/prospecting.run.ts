import { Job } from 'bullmq';
import {
  createDatabaseClient,
  enrichProspectProfile,
  executeProspectingTask,
  markProspectEnrichFailed
} from '@ai-growth-ops/database';

export interface ProspectingRunInput {
  taskId: string;
  organizationId: string;
  userId: string;
  executionToken: string;
  forceRecrawl?: boolean;
}

export interface ProspectingEnrichInput {
  candidateId: string;
  organizationId: string;
  userId: string;
}

export async function handleProspectingRun(
  job: Job<ProspectingRunInput | ProspectingEnrichInput>
): Promise<void> {
  const db = createDatabaseClient();

  if (job.name === 'prospecting.enrich') {
    const { candidateId, organizationId, userId } =
      job.data as ProspectingEnrichInput;
    try {
      await enrichProspectProfile(db, candidateId, organizationId, userId);
      job.log(`Enriched candidate ${candidateId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markProspectEnrichFailed(
        db,
        candidateId,
        organizationId,
        message
      ).catch(() => undefined);
      throw error;
    }
    return;
  }

  const { taskId, organizationId, userId, executionToken, forceRecrawl } =
    job.data as ProspectingRunInput;

  const result = await executeProspectingTask(
    db,
    taskId,
    organizationId,
    userId,
    executionToken,
    { forceRecrawl: Boolean(forceRecrawl) }
  );

  job.log(
    `Prospecting completed: ${result.totalCandidates} candidates from ${result.totalComments} comments`
  );
}
