'use client';

import { ShieldAlert, CheckCircle2 } from 'lucide-react';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { Button } from '@/components/ui/button';
import { NODE_ORDER, type NodeName, type NodeResult } from '@/lib/api/agent';

const NODE_LABEL: Record<NodeName, string> = {
  INIT: '初始化',
  METRICS: '数据采集',
  CONTENT: '内容生成',
  PUBLISH: '发布执行',
  REVIEW: '复盘总结'
};

function preview(input: unknown): string {
  try {
    const s = typeof input === 'string' ? input : JSON.stringify(input);
    return s.length > 160 ? s.slice(0, 160) + '…' : s;
  } catch {
    return '(无法预览)';
  }
}

export function EscalationList({
  runId,
  nodeResults,
  runStatus,
  onApprove,
  approving
}: {
  runId: string;
  nodeResults: Partial<Record<NodeName, NodeResult>>;
  runStatus: 'pending' | 'running' | 'success' | 'failed' | 'paused';
  onApprove: (runId: string) => void;
  approving: boolean;
}) {
  const items = NODE_ORDER.flatMap((node) => {
    const r = nodeResults[node];
    return (r?.escalatedItems ?? []).map((item, idx) => ({
      key: `${node}-${idx}`,
      node,
      ...item
    }));
  });

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <CheckCircle2 className="h-8 w-8 text-green-500" />
        <p className="text-sm text-muted-foreground">暂无待审升级项，运行一切顺利。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((it) => (
        <div
          key={it.key}
          className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/30"
        >
          <div className="flex flex-wrap items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs dark:bg-amber-900/50">
              {it.toolName}
            </code>
            <span className="text-xs text-muted-foreground">
              @ {NODE_LABEL[it.node]}
            </span>
            <RiskBadge level={it.risk} />
          </div>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/60 p-2 font-mono text-xs text-muted-foreground">
            {preview(it.input)}
          </pre>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {runStatus === 'paused' ? (
          <>
            <Button
              size="sm"
              disabled={approving}
              onClick={() => onApprove(runId)}
            >
              {approving ? '批准中…' : '批准并续跑'}
            </Button>
            <span className="text-xs text-muted-foreground">
              批准后运行从当前节点恢复，已批准的写操作将被放行执行。
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            运行状态：{runStatus}（升级项已随续跑处理或无需操作）
          </span>
        )}
      </div>
    </div>
  );
}
