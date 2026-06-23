'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listAgentRuns,
  getAgentRun,
  triggerAgentRun,
  acknowledgeRun,
  type AgentRunSummary,
  type RunStatus
} from '@/lib/api/agent';
import { listNotifications } from '@/lib/api/notifications';
import { queryKeys } from '@/lib/query-keys';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { RunTimeline } from '@/components/cockpit/RunTimeline';
import { EscalationList } from '@/components/cockpit/EscalationList';
import { DailyReport } from '@/components/cockpit/DailyReport';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectOption
} from '@/components/ui/select';
import { Rocket, Play, History, Coins, Clock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_META: Record<
  RunStatus,
  { label: string; cls: string }
> = {
  pending: { label: '排队中', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  running: { label: '运行中', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  success: { label: '已完成', cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
  failed: { label: '失败', cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  paused: { label: '待处理', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' }
};

function fmtTime(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('zh-CN', { hour12: false });
}

function duration(start: string | null, end: string | null): string {
  if (!start) return '—';
  const t0 = new Date(start).getTime();
  const t1 = end ? new Date(end).getTime() : Date.now();
  const sec = Math.max(0, Math.round((t1 - t0) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}m${r}s`;
}

function RunStatusBadge({ status }: { status: RunStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', m.cls)}>
      {m.label}
    </span>
  );
}

export default function CockpitPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autonomy, setAutonomy] = useState<'L2_AUTOPILOT_LIGHT' | 'L1_COPILOT'>('L2_AUTOPILOT_LIGHT');
  const [dryRun, setDryRun] = useState(true);

  // Recent runs list (history + latest selection source).
  const runsQuery = useQuery({
    queryKey: queryKeys.agent.runs,
    queryFn: listAgentRuns,
    refetchInterval: 4000
  });

  const items: AgentRunSummary[] = runsQuery.data?.items ?? [];

  // Default-select the latest run once loaded.
  useEffect(() => {
    if (!selectedId && items.length > 0) setSelectedId(items[0].id);
  }, [selectedId, items]);

  // Selected run detail — polled while active.
  const runQuery = useQuery({
    queryKey: queryKeys.agent.run(selectedId ?? ''),
    queryFn: () => getAgentRun(selectedId!),
    enabled: !!selectedId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'pending' || s === 'running' ? 2000 : false;
    }
  });

  // Daily report = latest daily_report notification.
  const notifQuery = useQuery({
    queryKey: queryKeys.notifications.all,
    queryFn: listNotifications,
    select: (list) =>
      list
        .filter((n) => n.type === 'daily_report')
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null
  });

  const triggerMut = useMutation({
    mutationFn: () => triggerAgentRun({ autonomyLevel: autonomy, dryRun }),
    onSuccess: (data) => {
      toast.success(dryRun ? '已发起 dry-run 运行' : '已发起运行（真实发布）');
      setSelectedId(data.runId);
      qc.invalidateQueries({ queryKey: queryKeys.agent.runs });
    },
    onError: () => toast.error('发起失败，请重试')
  });

  const ackMut = useMutation({
    mutationFn: (id: string) => acknowledgeRun(id),
    onSuccess: () => {
      toast.success('已标记处理');
      if (selectedId) qc.invalidateQueries({ queryKey: queryKeys.agent.run(selectedId) });
    },
    onError: () => toast.error('标记失败')
  });

  const run = runQuery.data;
  const acknowledged = !!(run?.metadata?.acknowledgedAt);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader
        title="运营驾驶舱"
        description="自主运营 Agent 的每日运行、升级审批与日报，一站式掌控。"
      />

      {/* Trigger bar */}
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">自治等级</span>
              <Select value={autonomy} onValueChange={(v) => setAutonomy(v as typeof autonomy)} className="w-44">
                <SelectOption value="L2_AUTOPILOT_LIGHT">L2 · 轻度自动驾驶</SelectOption>
                <SelectOption value="L1_COPILOT">L1 · 副驾驶（需确认）</SelectOption>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={dryRun} onCheckedChange={setDryRun} />
              <span className={dryRun ? 'text-muted-foreground' : 'font-medium text-amber-600 dark:text-amber-400'}>
                {dryRun ? 'Dry-run（演练，不真实发布）' : '真实发布'}
              </span>
            </label>
          </div>
          <Button
            onClick={() => triggerMut.mutate()}
            disabled={triggerMut.isPending}
          >
            <Rocket className="mr-1.5 h-4 w-4" />
            {triggerMut.isPending ? '发起中…' : '发起今日运行'}
          </Button>
        </CardContent>
      </Card>

      {/* Current run hero */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Play className="h-4 w-4" /> 当前运行
            </CardTitle>
            {run && <RunStatusBadge status={run.status} />}
          </div>
        </CardHeader>
        <CardContent>
          {!run ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <History className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                还没有运行记录。点击上方「发起今日运行」开始第一次自主运营。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric icon={<Clock className="h-4 w-4" />} label="开始时间" value={fmtTime(run.startedAt)} />
              <Metric icon={<Clock className="h-4 w-4" />} label="耗时" value={duration(run.startedAt, run.finishedAt)} />
              <Metric icon={<Coins className="h-4 w-4" />} label="Token 用量" value={run.tokensUsed.toLocaleString()} />
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">模式</span>
                <Badge variant={run.dryRun ? 'secondary' : 'outline'} className="w-fit">
                  {run.dryRun ? 'Dry-run' : '真实发布'}
                </Badge>
              </div>
              {run.error && (
                <div className="col-span-2 sm:col-span-4 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  {run.error}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History chips */}
      {items.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">历史运行：</span>
          {items.slice(0, 8).map((it) => (
            <button
              key={it.id}
              onClick={() => setSelectedId(it.id)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition',
                it.id === selectedId
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              <RunStatusBadge status={it.status} />
              <span className="ml-1">{fmtTime(it.startedAt ?? it.createdAt)}</span>
              {it.escalationCount > 0 && (
                <span className="text-amber-600 dark:text-amber-400">·{it.escalationCount}待审</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Timeline + Escalations */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">运行流程</CardTitle>
          </CardHeader>
          <CardContent>
            {run ? (
              <RunTimeline
                nodeResults={run.nodeResults}
                currentNode={run.currentNode}
                status={run.status}
              />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">发起运行后展示节点流程。</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4" /> 升级审批
              {run && (() => {
                const n = Object.values(run.nodeResults).reduce(
                  (a, r) => a + (r?.escalatedItems?.length ?? 0),
                  0
                );
                return n > 0 ? <Badge variant="destructive">{n}</Badge> : null;
              })()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {run ? (
              <EscalationList
                runId={run.id}
                nodeResults={run.nodeResults}
                acknowledged={acknowledged}
                onAcknowledge={(id) => ackMut.mutate(id)}
                acknowledging={ackMut.isPending}
              />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">暂无运行。</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily report */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">今日日报</CardTitle>
        </CardHeader>
        <CardContent>
          <DailyReport report={notifQuery.data ?? null} />
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
