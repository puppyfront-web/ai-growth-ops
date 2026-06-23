import type { Job } from 'bullmq';
import { createDatabaseClient } from '@ai-growth-ops/database';
import type { DatabaseClient } from '@ai-growth-ops/database';
import {
  createSupervisor,
  runDomainAgent,
  createConfirmationGate,
  createWorkingMemory,
  createPreferencesStore,
  type AgentDefinition,
  type LoopNode,
  type NodeResult,
  type PreferenceDomain,
  type SupervisorState,
  type LLMClient
} from '@ai-growth-ops/runtime';
import { createDbCredentialResolver } from '../credentials.js';
import { publishDailyReport } from '../notifications.js';

export interface AgentRunJobPayload {
  runId?: string;
  task?: 'daily-agent-run';
}

function autonomyFromRun(
  run: { agentName: string }
): SupervisorState['autonomyLevel'] {
  if (run.agentName.startsWith('L3')) return 'L3_FULL_AUTOPILOT';
  if (run.agentName.startsWith('L1')) return 'L1_COPILOT';
  return 'L2_AUTOPILOT_LIGHT';
}

/**
 * Maps supervisor status to the AgentRun.status bare-string column.
 * `paused` is preserved (run awaits human input), NOT mapped to `running`
 * (which would leave a paused run stuck as "running" in the DB forever).
 */
function mapStatus(s: SupervisorState['status']): string {
  return s === 'completed'
    ? 'success'
    : s === 'failed'
      ? 'failed'
      : s === 'paused'
        ? 'paused'
        : 'running';
}

export async function handleAgentRun(
  job: Job<AgentRunJobPayload>,
  dbOverride?: DatabaseClient,
  /**
   * Test seam: inject a (typically stub) LLMClient so the full
   * handler → supervisor → domain-agent → gate → persistence loop can be
   * exercised deterministically without a real LLM. Production callers leave
   * this undefined; `runDomainAgent` then falls back to `createLLMClient()`.
   */
  llmClientOverride?: LLMClient
): Promise<void> {
  const db = dbOverride ?? createDatabaseClient();

  // Resolve runId: explicit (manual API) or create one for the daily scheduled run.
  let runId = job.data.runId;
  if (!runId) {
    const admin = await db.user.findFirst({
      where: { email: process.env.ADMIN_EMAIL || 'admin@ai-growth-ops.local' }
    });
    const org = await db.organization.findFirst();
    if (!admin || !org) {
      throw new Error(
        'daily run needs an admin user + organization (seed first)'
      );
    }
    const created = await db.agentRun.create({
      data: {
        organizationId: org.id,
        userId: admin.id,
        agentName: 'L2_AUTOPILOT_LIGHT',
        status: 'pending',
        // Server-side cookie injection is now wired (createDbCredentialResolver),
        // so real publishing is *possible* — but dry-run remains the SAFE DEFAULT.
        // Set AGENT_DAILY_DRY_RUN=false to opt into real publishing once a valid
        // decrypted cookie is resolvable for the target platform.
        input: { dryRun: process.env.AGENT_DAILY_DRY_RUN !== 'false' }
      }
    });
    runId = created.id;
  }

  const run = await db.agentRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`AgentRun ${runId} not found`);

  // ── Re-entry guard (BullMQ retry safety) ──────────────────────────
  // BullMQ retries the same job on throw. The per-invocation `call.id`
  // cache does not survive across handler invocations, so a retry would
  // re-enter at INIT and re-execute every node — including PUBLISH, which
  // risks a double-publish. Gate the retry here, BEFORE initialising any
  // state or the loop.
  if (run.status === 'success') {
    // Already completed (duplicate delivery). Idempotent no-op.
    return;
  }
  if (run.status === 'failed') {
    const priorOutput = (run.output as Record<string, unknown> | null) ?? null;
    const nodeResults = (priorOutput?.nodeResults as
      | Record<string, unknown>
      | undefined) ?? undefined;
    // If PUBLISH already produced a result, re-running risks a duplicate
    // external write. Mark for manual review and STOP the retry loop —
    // return WITHOUT throwing (throwing would trigger another BullMQ retry
    // and re-enter this guard, looping indefinitely).
    if (nodeResults && typeof nodeResults.PUBLISH !== 'undefined') {
      await db.agentRun.update({
        where: { id: runId },
        data: {
          error:
            'aborted retry: run already reached PUBLISH, manual review required'
        }
      });
      return;
    }
    // Otherwise (failed without PUBLISH) → safe to re-init from INIT; no
    // write tool has executed yet. Fall through.
  }

  const autonomyLevel = autonomyFromRun(run);
  const gate = createConfirmationGate();
  const workingMemory = createWorkingMemory();
  const preferences = createPreferencesStore(db, run.organizationId);
  // Server-side cookie resolver: injects the decrypted platform cookie into
  // write tools at execute time so daily runs are no longer locked to dry-run.
  // The cookie never enters the LLM context — see runtime CredentialResolver.
  const credentials = createDbCredentialResolver(db);

  // Accumulated token usage across all domain-node results for this run.
  // REVIEW/supervisor produces no tokens, so it does not contribute. This is
  // flushed into AgentRun.tokensUsed on the terminal update (the same update
  // that sets `finishedAt`).
  let tokensUsedTotal = 0;

  const buildRunNode = (state: SupervisorState) => async (
    _s: SupervisorState,
    agent: AgentDefinition | 'supervisor',
    node: LoopNode
  ): Promise<NodeResult> => {
    if (agent === 'supervisor') {
      const summaries = Object.values(state.nodeResults)
        .filter((r): r is NonNullable<typeof r> => !!r)
        .map((r) => `- ${r.node}: ${r.summary ?? '(no summary)'}`)
        .join('\n');
      return {
        node,
        outcome: 'done',
        summary: `每日运营复盘：\n${summaries}`
      };
    }
    const prefs = await preferences.forDomain(
      run.userId,
      agent.domain as PreferenceDomain
    );
    const result = await runDomainAgent({
      agent,
      userId: run.userId,
      orgId: run.organizationId,
      nodeName: node,
      task: `执行 ${node} 节点任务`,
      autonomyLevel,
      dryRun:
        autonomyLevel === 'L1_COPILOT'
          ? false
          : ((run.input as Record<string, unknown> | null)?.dryRun as
              | boolean
              | undefined) ?? false,
      workingMemory,
      preferences: prefs,
      confirmationGate: gate,
      credentials,
      llmClient: llmClientOverride,
      maxSteps: 8
    });
    tokensUsedTotal += result.tokenUsage.totalTokens;
    const outcome = result.escalatedItems.length > 0 ? 'need_input' : 'done';
    return {
      node,
      outcome,
      summary: result.finalText.slice(0, 500),
      escalatedItems: result.escalatedItems
    };
  };

  let state: SupervisorState = {
    runId,
    userId: run.userId,
    orgId: run.organizationId,
    autonomyLevel,
    dryRun: false,
    currentNode: 'INIT',
    nodeResults: {
      INIT: undefined,
      METRICS: undefined,
      CONTENT: undefined,
      PUBLISH: undefined,
      REVIEW: undefined
    },
    startedAt: new Date().toISOString(),
    status: 'running'
  };
  await db.agentRun.update({
    where: { id: runId },
    data: { status: 'running', startedAt: new Date() }
  });

  try {
    let guard = 0;
    while (state.status === 'running' && guard++ < 10) {
      const supervisor = createSupervisor({ runNode: buildRunNode(state) });
      state = await supervisor.runNode(state);
      await db.agentRun.update({
        where: { id: runId },
        data: { output: state as unknown as never, status: mapStatus(state.status) }
      });
    }
    await db.agentRun.update({
      where: { id: runId },
      data: {
        status: mapStatus(state.status),
        // A paused run is awaiting human input — not finished.
        finishedAt: state.status === 'paused' ? undefined : new Date(),
        // Persist accumulated token usage across all domain nodes
        // (REVIEW/supervisor contributes none).
        tokensUsed: tokensUsedTotal
      }
    });

    // Daily report: only after a completed run. Paused (awaiting human input)
    // and failed runs do not publish a daily report. Delivery must never fail
    // the run — wrap in a catch and swallow, logging the error.
    if (state.status === 'completed') {
      try {
        await publishDailyReport(state, db, {
          feishuWebhookUrl: process.env.FEISHU_DAILY_REPORT_WEBHOOK
        });
      } catch (reportErr) {
        console.error(
          `[agent.run] daily report delivery failed for ${runId}:`,
          reportErr
        );
      }
    }
  } catch (err) {
    await db.agentRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        error: String(err),
        finishedAt: new Date()
      }
    });
    throw err;
  } finally {
    if (!dbOverride) await db.$disconnect();
  }
}
