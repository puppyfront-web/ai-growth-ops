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
  type SupervisorState
} from '@ai-growth-ops/runtime';

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
  dbOverride?: DatabaseClient
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
        input: { dryRun: false }
      }
    });
    runId = created.id;
  }

  const run = await db.agentRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`AgentRun ${runId} not found`);

  const autonomyLevel = autonomyFromRun(run);
  const gate = createConfirmationGate();
  const workingMemory = createWorkingMemory();
  const preferences = createPreferencesStore(db, run.organizationId);

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
    const prefs = await preferences.forDomain(run.userId, agent.domain as any);
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
          : (run.input as any)?.dryRun ?? false,
      workingMemory,
      preferences: prefs,
      confirmationGate: gate,
      maxSteps: 8
    });
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
        data: { output: state as any, status: mapStatus(state.status) }
      });
    }
    await db.agentRun.update({
      where: { id: runId },
      data: {
        status: mapStatus(state.status),
        // A paused run is awaiting human input — not finished.
        finishedAt: state.status === 'paused' ? undefined : new Date()
      }
    });
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
