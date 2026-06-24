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
import { resolveLlmClientFromDb } from '../llm-config.js';
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

// DEV ONLY (AGENT_DEV_STUB_LLM=1): deterministic stub LLM so the full
// pause→approve→resume flow can be exercised locally without a real model
// (e.g. no provider network/key). On the first CONTENT-node call it emits a
// high-risk publish.video call → the L1 gate escalates it → the run pauses.
// On every later call (including the resumed run) it finalizes, so the run
// completes after approval. Never enabled in production (no env var set).
let devStubEscalated = false;
function createDevStubLLM(): LLMClient {
  return {
    chatWithTools: async (messages: unknown) => {
      const list = messages as Array<{ content?: unknown }>;
      const isContent = list.some(
        (m) => typeof m.content === 'string' && m.content.includes('CONTENT')
      );
      if (!devStubEscalated && isContent) {
        devStubEscalated = true;
        return {
          text: '',
          toolCalls: [
            {
              id: 'dev-stub-1',
              name: 'publish.video',
              arguments: { __risk: 'high', __confidence: 0.9 }
            }
          ],
          tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
        } as never;
      }
      return {
        text: '节点完成',
        toolCalls: [],
        tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }
      } as never;
    }
  } as never;
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
  // BullMQ calls job processors as (job, token) where `token` is a string
  // (the job id used for concurrency control). The test-only `dbOverride`
  // occupies that same 2nd positional slot, so a non-client value (the BullMQ
  // token) must NOT be honored as a client — otherwise `db = token` (a string)
  // and `db.agentRun` crashes with "Cannot read properties of undefined
  // (reading 'findUnique')" on every production agent.run. Only a genuine
  // DatabaseClient (test injection) short-circuits createDatabaseClient().
  // BullMQ calls job processors as (job, token, abortSignal) — `token` (2nd)
  // is a string and `abortSignal` (3rd) is an AbortSignal; neither is a
  // DatabaseClient / LLMClient. The test-only dbOverride / llmClientOverride
  // occupy those same positional slots, so BOTH must be type-guarded: only a
  // genuine client is honored. Without these guards the BullMQ token is used
  // as `db` (db.agentRun crashes) and the AbortSignal as `llmClient`
  // (chatWithTools is not a function) — every production agent.run fails.
  const db =
    dbOverride && typeof dbOverride === 'object' && 'agentRun' in dbOverride
      ? dbOverride
      : createDatabaseClient();

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

  // Resolve the LLM client. Priority: (1) cockpit-configured org LLM config
  // (AppConfig key='llm_config', apiKey decrypted server-side — set from the
  // cockpit UI, NOT .env); (2) AGENT_DEV_STUB_LLM dev hook (local flow
  // verification without a real model); (3) undefined → runDomainAgent falls
  // back to createLLMClient() (env) as the last resort. The test-only
  // llmClientOverride slot is type-guarded because BullMQ passes an AbortSignal
  // there as the 3rd positional arg in production.
  const dbLlm = await resolveLlmClientFromDb(db, run.organizationId);
  const llmClient =
    llmClientOverride &&
    typeof (llmClientOverride as { chatWithTools?: unknown }).chatWithTools ===
      'function'
      ? llmClientOverride
      : dbLlm ??
        (process.env.AGENT_DEV_STUB_LLM === '1'
          ? createDevStubLLM()
          : undefined);

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

  // ── Auto-resume detection ─────────────────────────────────────────
  // Computed before buildRunNode so the closure can read `approvals`. A PAUSED
  // run reaches this handler ONLY via the cockpit "批准并续跑" action
  // (POST /api/agent/runs/:id/approve), which writes metadata.approvals and
  // re-enqueues this job. A paused job returns normally (no throw), so BullMQ
  // never auto-retries it — seeing `paused` here always means an explicit
  // resume: restore prior state, continue from the paused node, and let the
  // approved tools unlock the gate (see runDomainAgent `approvedTools`).
  const resuming = run.status === 'paused';
  const priorOutput = (run.output ?? null) as Record<string, unknown> | null;
  const runMetadata = (run.metadata ?? {}) as Record<string, unknown>;
  const approvals = (runMetadata.approvals as
    | Array<{ node: string; toolName: string }>
    | undefined) ?? [];
  const inputDryRun =
    ((run.input as Record<string, unknown> | null)?.dryRun as
      | boolean
      | undefined) ?? false;
  if (resuming) {
    // Carry forward tokens already consumed before the pause.
    tokensUsedTotal = run.tokensUsed ?? 0;
  }

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
    // On a resume, the operator approved specific tools for this node — pass
    // them so the gate unlocks those (previously-escalated) calls.
    const approvedTools = new Set(
      approvals.filter((a) => a.node === node).map((a) => a.toolName)
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
          : inputDryRun,
      workingMemory,
      preferences: prefs,
      confirmationGate: gate,
      credentials,
      approvedTools,
      llmClient,
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

  // ── Auto-resume detection ─────────────────────────────────────────
  // (block above, before buildRunNode) — restore prior state on resume.

  let state: SupervisorState;
  if (resuming && priorOutput?.nodeResults) {
    state = {
      runId,
      userId: run.userId,
      orgId: run.organizationId,
      autonomyLevel,
      dryRun: inputDryRun,
      // currentNode stays at the pause point — the loop re-executes that
      // node (now with approvedTools), overwriting its need_input result.
      currentNode:
        (priorOutput.currentNode as LoopNode | undefined) ?? 'INIT',
      nodeResults: priorOutput.nodeResults as SupervisorState['nodeResults'],
      // Preserve the original run start time across the resume.
      startedAt:
        (priorOutput.startedAt as string | undefined) ??
        new Date().toISOString(),
      status: 'running'
    };
  } else {
    state = {
      runId,
      userId: run.userId,
      orgId: run.organizationId,
      autonomyLevel,
      dryRun: inputDryRun,
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
  }
  await db.agentRun.update({
    where: { id: runId },
    // On resume, keep the original startedAt; only flip status back to running.
    data: resuming
      ? { status: 'running' }
      : { status: 'running', startedAt: new Date() }
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
