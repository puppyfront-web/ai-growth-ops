/**
 * Workflow Execution Engine
 *
 * Executes a series of declarative steps sequentially,
 * resolving ${variable} references from previous step outputs.
 *
 * Step types: skill, generate-media, platform-rewrite, publish,
 *             delay, sync-interactions, auto-reply, growth-review
 */

import { Job } from 'bullmq';
import { createDatabaseClient } from '@ai-growth-ops/database';
import type { Platform } from '@ai-growth-ops/database';
import { DefaultSkillRunner } from '@ai-growth-ops/skills';
import { getQueue, QUEUE_NAMES } from '../queue.js';

let _skillRunner: DefaultSkillRunner | null = null;
function getSkillRunner(): DefaultSkillRunner {
  if (!_skillRunner) _skillRunner = new DefaultSkillRunner();
  return _skillRunner;
}

export async function handleWorkflowExecute(job: Job): Promise<void> {
  const { executionId } = job.data as { executionId: string };
  const db = createDatabaseClient();

  const execution = await db.workflowExecution.findUnique({
    where: { id: executionId },
    include: { workflow: true }
  });
  if (!execution || !execution.workflow)
    throw new Error(`WorkflowExecution ${executionId} not found`);

  const steps = (execution.workflow.steps as unknown as StepDefinition[]) || [];
  const stepResults: StepResult[] =
    (execution.stepResults as unknown as StepResult[]) || [];

  try {
    for (let i = execution.currentStepIndex; i < steps.length; i++) {
      const step = steps[i];
      console.log(
        `[workflow] Executing step ${i + 1}/${steps.length}: ${step.type} (${step.id})`
      );

      // Resolve variable references in step input
      const resolvedInput = resolveVariables(step.input || {}, stepResults);

      let result: Record<string, unknown>;

      switch (step.type) {
        case 'skill':
          result = await executeSkillStep(step.skillName || '', resolvedInput);
          break;

        case 'generate-media':
          result = await executeGenerateMediaStep(
            db,
            execution.workflow.organizationId,
            execution.workflow.userId,
            resolvedInput
          );
          break;

        case 'platform-rewrite':
          result = await executePlatformRewriteStep(
            db,
            execution.workflow.organizationId,
            execution.workflow.userId,
            resolvedInput
          );
          break;

        case 'publish':
          result = await executePublishStep(
            db,
            execution.workflow.organizationId,
            execution.workflow.userId,
            resolvedInput
          );
          break;

        case 'sync-interactions':
          result = await executeSyncStep(resolvedInput);
          break;

        case 'auto-reply':
          result = {
            message:
              'Auto-reply enabled — interactions will be auto-replied based on config'
          };
          break;

        case 'growth-review':
          result = await executeSkillStep('growth-review', resolvedInput);
          break;

        case 'delay': {
          // Update execution state, then re-schedule
          await db.workflowExecution.update({
            where: { id: executionId },
            data: {
              currentStepIndex: i + 1,
              stepResults: [
                ...stepResults,
                {
                  stepId: step.id,
                  status: 'completed',
                  output: { delayed: true }
                }
              ] as unknown as Record<string, unknown>[]
            }
          });
          // Schedule continuation after delay
          const durationMs = parseDuration(
            String(resolvedInput.duration || '1h')
          );
          const { Queue } = await import('bullmq');
          const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
          const queue = new Queue('workflow.execute', {
            connection: { url: redisUrl }
          });
          await queue.add(
            'workflow.execute',
            { executionId },
            { delay: durationMs }
          );
          console.log(`[workflow] Delay step — will resume in ${durationMs}ms`);
          return; // Exit — will be resumed by the delayed job
        }

        default:
          result = { skipped: true, reason: `Unknown step type: ${step.type}` };
      }

      stepResults.push({
        stepId: step.id,
        status: 'completed',
        output: result
      });

      // Persist progress after each step
      await db.workflowExecution.update({
        where: { id: executionId },
        data: {
          currentStepIndex: i + 1,
          stepResults: stepResults as unknown as Record<string, unknown>[]
        }
      });
    }

    // All steps completed
    await db.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'completed', finishedAt: new Date() }
    });
    console.log(`[workflow] Execution ${executionId} completed`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'failed',
        errorMessage,
        finishedAt: new Date(),
        stepResults: stepResults as unknown as Record<string, unknown>[]
      }
    });
    console.error(`[workflow] Execution ${executionId} failed:`, errorMessage);
    throw err;
  }
}

// ── Step Executors ──────────────────────────────────────────────

async function executeSkillStep(
  skillName: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!skillName) throw new Error('skillName is required for skill step');
  const runner = getSkillRunner();
  const result = await runner.run({ skillName, input });
  if (result.status === 'success' && result.output) {
    return result.output as Record<string, unknown>;
  }
  throw new Error(
    `Skill ${skillName} failed: ${result.error || 'unknown error'}`
  );
}

async function executeGenerateMediaStep(
  db: ReturnType<typeof createDatabaseClient>,
  orgId: string,
  userId: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    // Call the media generation API endpoint instead of importing cross-package
    const apiUrl = process.env.API_URL || 'http://localhost:3100';
    const resp = await fetch(`${apiUrl}/api/media-assets/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: input.prompt,
        style: input.style,
        size: input.size,
        organizationId: orgId,
        userId
      })
    });
    if (!resp.ok)
      throw new Error(`Media generation API returned ${resp.status}`);
    const data = (await resp.json()) as Record<string, unknown>;
    return {
      mediaAssetId:
        (data as Record<string, unknown>).id ||
        (
          (data as Record<string, unknown>).asset as
            | Record<string, unknown>
            | undefined
        )?.id,
      fileName: (data as Record<string, unknown>).fileName
    };
  } catch (err) {
    console.error('[workflow] Media generation failed:', err);
    return { error: String(err), mediaAssetId: null };
  }
}

async function executePlatformRewriteStep(
  db: ReturnType<typeof createDatabaseClient>,
  orgId: string,
  userId: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const runner = getSkillRunner();
  const result = await runner.run({
    skillName: 'platform-rewrite',
    input: {
      sourceTitle: input.sourceTitle,
      sourceBody: input.sourceBody,
      platform: input.platform,
      contentType: input.contentType || 'text_image'
    }
  });

  if (result.status === 'success' && result.output) {
    const output = result.output as Record<string, unknown>;
    // Create a content variant if contentItemId is provided
    if (input.contentItemId && input.platform) {
      try {
        await db.contentVariant.create({
          data: {
            organizationId: orgId,
            userId,
            contentItemId: String(input.contentItemId),
            platform: String(input.platform) as Platform,
            contentType: String(input.contentType || 'text_image') as
              | 'text_image'
              | 'video'
              | 'article'
              | 'answer',
            title: String(output.title || ''),
            body: String(output.body || ''),
            tags: output.hashtags || [],
            complianceStatus: 'pending'
          }
        });
      } catch (err) {
        console.error('[workflow] Variant creation failed:', err);
      }
    }
    return output;
  }
  throw new Error(`Platform rewrite failed`);
}

async function executePublishStep(
  db: ReturnType<typeof createDatabaseClient>,
  orgId: string,
  userId: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const platforms = (input.platforms as string[]) || [];
  const contentItemId = String(input.contentItemId || '');
  if (!contentItemId)
    return { error: 'contentItemId is required for publish step' };

  const results: Record<string, unknown>[] = [];
  for (const platform of platforms) {
    const account = await db.platformAccount.findFirst({
      where: {
        organizationId: orgId,
        platform: platform as Platform,
        deletedAt: null
      }
    });
    if (!account) {
      results.push({ platform, error: 'No account found' });
      continue;
    }

    const variant = await db.contentVariant.findFirst({
      where: { contentItemId, platform: platform as Platform }
    });
    if (!variant) {
      results.push({ platform, error: 'No variant found' });
      continue;
    }

    const publishJob = await db.publishJob.create({
      data: {
        organizationId: orgId,
        userId,
        contentVariantId: variant.id,
        platformAccountId: account.id,
        platform: platform as Platform,
        contentType: variant.contentType,
        mode: 'browser_assist',
        status: 'DRAFT'
      }
    });

    const publishQueue = getQueue(QUEUE_NAMES.PUBLISH_EXECUTE);
    await publishQueue.add(
      QUEUE_NAMES.PUBLISH_EXECUTE,
      {
        publishJobId: publishJob.id,
        contentVariantId: variant.id,
        platformAccountId: account.id,
        platform,
        contentType: variant.contentType,
        mode: 'browser_assist'
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
    );

    results.push({ platform, publishJobId: publishJob.id, status: 'enqueued' });
  }
  return { results };
}

async function executeSyncStep(
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const platforms = (input.platforms as string[]) || [];
  const results: Record<string, string>[] = [];

  for (const platform of platforms) {
    const commentsQueue = getQueue(QUEUE_NAMES.INTERACTION_SYNC_COMMENTS);
    const messagesQueue = getQueue(QUEUE_NAMES.INTERACTION_SYNC_MESSAGES);
    await commentsQueue.add(
      QUEUE_NAMES.INTERACTION_SYNC_COMMENTS,
      { platform, platformAccountId: input.platformAccountId },
      { attempts: 2 }
    );
    await messagesQueue.add(
      QUEUE_NAMES.INTERACTION_SYNC_MESSAGES,
      { platform, platformAccountId: input.platformAccountId },
      { attempts: 2 }
    );
    results.push({ platform, status: 'enqueued' });
  }
  return { results };
}

// ── Helpers ─────────────────────────────────────────────────────

interface StepDefinition {
  id: string;
  type: string;
  skillName?: string;
  input?: Record<string, unknown>;
}

interface StepResult {
  stepId: string;
  status: string;
  output: Record<string, unknown>;
}

function resolveVariables(
  input: Record<string, unknown>,
  results: StepResult[]
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      // Replace ${stepId.field} references
      resolved[key] = value.replace(/\$\{([^}]+)\}/g, (_match, ref: string) => {
        const [stepId, ...fieldPath] = ref.split('.');
        const stepResult = results.find((r) => r.stepId === stepId);
        if (!stepResult) return '';
        let current: unknown = stepResult.output;
        for (const field of fieldPath) {
          if (current && typeof current === 'object') {
            current = (current as Record<string, unknown>)[field];
          } else {
            return '';
          }
        }
        return String(current ?? '');
      });
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      resolved[key] = resolveVariables(
        value as Record<string, unknown>,
        results
      );
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) return 3600000; // default 1h
  const [, amount, unit] = match;
  const n = parseInt(amount);
  switch (unit) {
    case 'ms':
      return n;
    case 's':
      return n * 1000;
    case 'm':
      return n * 60_000;
    case 'h':
      return n * 3_600_000;
    case 'd':
      return n * 86_400_000;
    default:
      return 3_600_000;
  }
}
