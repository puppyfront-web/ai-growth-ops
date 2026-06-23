'use client';

import { Check, Pause, X, Circle, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NODE_ORDER, type NodeName, type NodeResult, type RunStatus } from '@/lib/api/agent';

const NODE_META: Record<NodeName, { label: string; hint: string }> = {
  INIT: { label: '初始化', hint: '账号与认证就绪' },
  METRICS: { label: '数据采集', hint: '昨日平台数据' },
  CONTENT: { label: '内容生成', hint: '产出今日内容' },
  PUBLISH: { label: '发布执行', hint: '发文/发视频' },
  REVIEW: { label: '复盘总结', hint: '汇总与日报' }
};

type NodeState = 'done' | 'need_input' | 'blocked' | 'empty' | 'running' | 'pending';

function stateFor(
  name: NodeName,
  result: NodeResult | undefined,
  currentNode: NodeName | null,
  status: RunStatus
): NodeState {
  if (result) {
    if (result.outcome === 'done' || result.outcome === 'empty') return 'done';
    if (result.outcome === 'need_input') return 'need_input';
    if (result.outcome === 'blocked') return 'blocked';
    return 'done';
  }
  // No result yet.
  if (status === 'running' && currentNode === name) return 'running';
  if (status === 'paused' && currentNode === name) return 'need_input';
  return 'pending';
}

const STATE_STYLE: Record<
  NodeState,
  { icon: React.ReactNode; ring: string; bg: string; text: string }
> = {
  done: {
    icon: <Check className="h-4 w-4" />,
    ring: 'border-green-500',
    bg: 'bg-green-500 text-white',
    text: 'text-green-700 dark:text-green-300'
  },
  running: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    ring: 'border-blue-500',
    bg: 'bg-blue-500 text-white',
    text: 'text-blue-700 dark:text-blue-300'
  },
  need_input: {
    icon: <Pause className="h-4 w-4" />,
    ring: 'border-amber-500',
    bg: 'bg-amber-500 text-white',
    text: 'text-amber-700 dark:text-amber-300'
  },
  blocked: {
    icon: <X className="h-4 w-4" />,
    ring: 'border-red-500',
    bg: 'bg-red-500 text-white',
    text: 'text-red-700 dark:text-red-300'
  },
  empty: {
    icon: <Circle className="h-4 w-4" />,
    ring: 'border-muted-foreground/30',
    bg: 'bg-muted text-muted-foreground',
    text: 'text-muted-foreground'
  },
  pending: {
    icon: <Circle className="h-4 w-4" />,
    ring: 'border-muted-foreground/20',
    bg: 'bg-muted/50 text-muted-foreground/60',
    text: 'text-muted-foreground/60'
  }
};

const STATE_LABEL: Record<NodeState, string> = {
  done: '已完成',
  running: '进行中',
  need_input: '待处理',
  blocked: '已阻断',
  empty: '无数据',
  pending: '待执行'
};

export function RunTimeline({
  nodeResults,
  currentNode,
  status,
  onToggleSummary
}: {
  nodeResults: Partial<Record<NodeName, NodeResult>>;
  currentNode: NodeName | null;
  status: RunStatus;
  onToggleSummary?: (node: NodeName) => void;
}) {
  return (
    <ol className="relative flex flex-col gap-0">
      {NODE_ORDER.map((name, i) => {
        const result = nodeResults[name];
        const state = stateFor(name, result, currentNode, status);
        const style = STATE_STYLE[state];
        const isLast = i === NODE_ORDER.length - 1;
        const hasEscalation = (result?.escalatedItems?.length ?? 0) > 0;
        return (
          <li key={name} className="relative flex gap-4 pb-6 last:pb-0">
            {!isLast && (
              <span
                className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-border"
                aria-hidden
              />
            )}
            <span
              className={cn(
                'z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
                style.bg,
                style.ring
              )}
            >
              {style.icon}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{NODE_META[name].label}</span>
                <span className={cn('text-xs', style.text)}>
                  {STATE_LABEL[state]}
                </span>
                {hasEscalation && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3" />
                    {result!.escalatedItems!.length} 项待审
                  </span>
                )}
                {result?.summary && onToggleSummary && (
                  <button
                    type="button"
                    onClick={() => onToggleSummary(name)}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    详情
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {NODE_META[name].hint}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
