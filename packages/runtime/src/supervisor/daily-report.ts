import type { SupervisorState, NodeResult, LoopNode } from '../types.js';

const NODE_ORDER: LoopNode[] = ['INIT', 'METRICS', 'CONTENT', 'PUBLISH', 'REVIEW'];

export interface DailyReport {
  title: string;
  markdown: string;
}

/**
 * Synthesize a human-readable daily report from a completed (or paused) supervisor run.
 * Pure function — no I/O — so the host-mode path (runtime-mcp) and the scheduled path
 * (worker) can both render the same shape from the same SupervisorState.
 */
export function buildDailyReport(state: SupervisorState): DailyReport {
  const lines: string[] = [
    `# 运营日报 · run ${state.runId.slice(0, 8)}`,
    '',
    `- 状态：${state.status}${state.dryRun ? '（dry-run）' : ''}`,
    `- 自主等级：${state.autonomyLevel}`,
    '',
    '## 各节点'
  ];

  const escalations: Array<{ node: string; tool: string; risk: string }> = [];
  for (const node of NODE_ORDER) {
    const r: NodeResult | undefined = state.nodeResults[node];
    if (!r) {
      lines.push(`- **${node}**：—（未执行）—`);
      continue;
    }
    const flag =
      r.outcome === 'done' ? '✅' : r.outcome === 'need_input' ? '⏸' : r.outcome === 'blocked' ? '🚫' : '•';
    lines.push(`- **${node}** ${flag}：${r.summary ?? '(无摘要)'}`);
    for (const e of r.escalatedItems ?? []) {
      escalations.push({ node, tool: e.toolName, risk: e.risk });
    }
  }

  if (escalations.length) {
    lines.push('', '## 需人工处理');
    for (const e of escalations) lines.push(`- [${e.node}] \`${e.tool}\`（风险 ${e.risk}）`);
  }

  return { title: 'AI Growth Ops 运营日报', markdown: lines.join('\n') };
}
