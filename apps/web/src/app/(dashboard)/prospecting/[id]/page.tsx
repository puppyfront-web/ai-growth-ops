'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useParams,
  useRouter,
  useSearchParams
} from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  getProspectingTask,
  listProspectCandidates,
  runProspectingTask,
  exportProspectingTask,
  enrichProspectProfile,
  getProspectingGuard,
  estimateProspectingMinutes,
  formatProspectingProgress,
  getProspectingProgressPercent,
  isAccountLoginRequiredError,
  setProspectingSchedule,
  type ProspectCandidate,
  type ProspectCandidateFilters,
  type ProspectSort
} from '@/lib/api/prospecting';
import { ApiError } from '@/lib/api/client';
import {
  ProspectFilterBar,
  emptyProspectFilters,
  hasActiveProspectFilters
} from '@/components/prospecting/ProspectFilterBar';
import { ProspectListRow } from '@/components/prospecting/ProspectListRow';
import { ProspectDetailPanel } from '@/components/prospecting/ProspectDetailPanel';
import {
} from '@/components/prospecting/prospect-shared';
import { DataTablePagination } from '@/components/shared/DataTablePagination';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { NativeSelect } from '@/components/ui/native-select';
import { formatDateTime } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import { platformLabels } from '@/lib/constants';
import { restorePlatformAccount } from '@/lib/api/integrations';
import { BrowserLoginDialog } from '@/components/integrations/BrowserLoginDialog';
import { BoundAccountLoginNotice } from '@/components/prospecting/BoundAccountLoginNotice';
import { ConvertDialog } from '@/components/prospecting/ConvertDialog';
import { CaptchaSolveDialog } from '@/components/prospecting/CaptchaSolveDialog';
import { MobileDetailOverlay } from '@/components/prospecting/MobileDetailOverlay';

const statusLabels: Record<string, string> = {
  draft: '草稿',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消'
};

function enrichBusy(candidate: ProspectCandidate, enrichingId: string | null) {
  return (
    enrichingId === candidate.id ||
    candidate.metadata?.enrichStatus === 'queued' ||
    candidate.metadata?.enrichStatus === 'running'
  );
}

export default function ProspectingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const qc = useQueryClient();
  const [convertTarget, setConvertTarget] = useState<ProspectCandidate | null>(
    null
  );
  // 筛选与分页从 URL 恢复（interaction-spec §6：列表状态可分享、刷新不丢）。
  const [filters, setFilters] = useState<ProspectCandidateFilters>(() => {
    const level = searchParams.get('leadLevel') ?? '';
    const persona = searchParams.get('personaTag') ?? '';
    const converted = searchParams.get('converted') ?? '';
    const dateRange = searchParams.get('dateRange') ?? '';
    return {
      q: searchParams.get('q') ?? '',
      minScore: Number(searchParams.get('minScore')) || 0,
      leadLevel: ['A', 'B', 'C', 'D'].includes(level)
        ? (level as ProspectCandidateFilters['leadLevel'])
        : '',
      personaTag: [
        'demand_seeker',
        'peer_vendor',
        'already_adopted',
        'practitioner',
        'job_seeker',
        'irrelevant'
      ].includes(persona)
        ? (persona as ProspectCandidateFilters['personaTag'])
        : '',
      converted: ['yes', 'no'].includes(converted)
        ? (converted as ProspectCandidateFilters['converted'])
        : '',
      dateRange: ['today', '7d', '30d'].includes(dateRange)
        ? (dateRange as ProspectCandidateFilters['dateRange'])
        : ''
    };
  });
  const [page, setPage] = useState(() =>
    Math.max(1, Number(searchParams.get('page')) || 1)
  );
  const [sort, setSort] = useState<ProspectSort>(() =>
    searchParams.get('sort') === 'relevance' ? 'relevance' : 'latest'
  );
  const [pageSize, setPageSize] = useState(() =>
    Math.min(100, Math.max(10, Number(searchParams.get('pageSize')) || 20))
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [focusCandidateId, setFocusCandidateId] = useState<string | null>(null);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [enrichError, setEnrichError] = useState('');
  const [forceRecrawl, setForceRecrawl] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [boundLoginOpen, setBoundLoginOpen] = useState(false);
  const [boundLoginRestoring, setBoundLoginRestoring] = useState(false);
  const [scheduleInterval, setScheduleInterval] = useState('24');
  const [convertNotice, setConvertNotice] = useState<{
    reused: boolean;
    customerId: string;
    leadId?: string;
  } | null>(null);

  const {
    data: task,
    isLoading,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: ['prospecting', 'task', id],
    queryFn: () => getProspectingTask(id),
    refetchInterval: (q) =>
      q.state.data?.status === 'running' ? 3000 : false
  });

  const {
    data: candidatesPage,
    isLoading: candidatesLoading,
    error: candidatesError,
    refetch: refetchCandidates
  } = useQuery({
    queryKey: [
      'prospecting',
      'task',
      id,
      'candidates',
      filters,
      page,
      pageSize,
      sort
    ],
    queryFn: () =>
      listProspectCandidates(id, filters, page, pageSize, undefined, sort),
    enabled: Boolean(task),
    refetchInterval: (q) => {
      if (task?.status === 'running') return 3000;
      const items = q.state.data?.items ?? [];
      return items.some(
        (item) =>
          item.metadata?.enrichStatus === 'queued' ||
          item.metadata?.enrichStatus === 'running'
      )
        ? 3000
        : false;
    }
  });

  // 客户详情页会带 #candidate-{id} 深链进来；分页后先用一次预查询算出
  // 该潜客所在页，再滚动定位，避免用户在分页里手翻。
  const focusLookupDone = useRef(false);
  useEffect(() => {
    if (focusLookupDone.current) return;
    const match = /^#candidate-([\w-]{6,64})$/.exec(window.location.hash);
    if (!match) {
      focusLookupDone.current = true;
      return;
    }
    focusLookupDone.current = true;
    const candidateId = match[1];
    setFocusCandidateId(candidateId);
    let cancelled = false;
    listProspectCandidates(id, emptyProspectFilters, 1, pageSize, candidateId)
      .then((preview) => {
        if (!cancelled && preview.focusResolved) setPage(preview.page);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, pageSize]);

  const focusScrolled = useRef(false);
  useEffect(() => {
    if (!focusCandidateId || focusScrolled.current || !candidatesPage) return;
    const element = document.getElementById(
      `candidate-${focusCandidateId}`
    );
    if (element) {
      focusScrolled.current = true;
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focusCandidateId, candidatesPage]);

  // 筛选/分页写回 URL；q 输入防抖，避免每键一次历史记录。
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.minScore > 0) params.set('minScore', String(filters.minScore));
      if (filters.leadLevel) params.set('leadLevel', filters.leadLevel);
      if (filters.personaTag) params.set('personaTag', filters.personaTag);
      if (filters.converted) params.set('converted', filters.converted);
      if (filters.dateRange) params.set('dateRange', filters.dateRange);
      if (page > 1) params.set('page', String(page));
      if (pageSize !== 20) params.set('pageSize', String(pageSize));
      if (sort !== 'latest') params.set('sort', sort);
      const qs = params.toString();
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const target = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
      if (current !== target) router.replace(target, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, page, pageSize, sort, router]);

  const candidates = candidatesPage?.items ?? [];
  const selectedItem =
    candidates.find((item) => item.id === selectedId) ?? null;

  // 双栏选中：无选中时默认取当前页首位（桌面端，避免移动端自动弹详情）；
  // 深链目标优先；筛选/翻页后选中项不在当前页则重置。
  useEffect(() => {
    if (!candidatesPage) return;
    const items = candidatesPage.items;
    if (selectedId && items.some((item) => item.id === selectedId)) return;
    const focused = focusCandidateId
      ? items.find((item) => item.id === focusCandidateId)
      : undefined;
    if (focused) {
      setSelectedId(focused.id);
      return;
    }
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setSelectedId(items[0]?.id ?? null);
    }
  }, [candidatesPage, selectedId, focusCandidateId]);

  const handleSelect = (candidate: ProspectCandidate) => {
    setSelectedId(candidate.id);
    if (!window.matchMedia('(min-width: 1024px)').matches) {
      setMobileDetailOpen(true);
    }
  };

  const { data: guard } = useQuery({
    queryKey: ['prospecting', 'guard', task?.platformAccountId],
    queryFn: () =>
      getProspectingGuard(
        task?.platform ?? 'douyin',
        task?.platformAccountId ?? undefined
      ),
    enabled: Boolean(task)
  });

  const runMutation = useMutation({
    mutationFn: () => runProspectingTask(id, forceRecrawl),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['prospecting', 'task', id] }),
    // Cookie can lapse between page load and the click — follow the same
    // "jump to account config" path as the pre-click check.
    onError: (err: Error) => {
      if (isAccountLoginRequiredError(err.message)) {
        router.push('/integrations/platforms');
      }
    }
  });

  // 任务绑定账号失效/被移除时的直达恢复：先恢复软删行再弹扫码登录；
  // 账号未删除（仅凭据过期）时 restore 返回 400，忽略后同样进入扫码流程
  const handleBoundAccountRelogin = async () => {
    if (!task?.platformAccountId) return;
    setBoundLoginRestoring(true);
    try {
      await restorePlatformAccount(task.platformAccountId).catch((err) => {
        if (!(err instanceof ApiError) || err.status !== 400) throw err;
      });
      setBoundLoginOpen(true);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `${err.message}，也可到「集成 → 平台账号」处理`
          : '恢复账号失败，请到「集成 → 平台账号」处理'
      );
    } finally {
      setBoundLoginRestoring(false);
    }
  };

  const scheduleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      setProspectingSchedule(id, enabled, Number(scheduleInterval) || 24),
    onSuccess: () => {
      toast.success('定时执行已更新');
      qc.invalidateQueries({ queryKey: ['prospecting', 'task', id] });
    },
    onError: (err: Error) => toast.error(err.message || '设置失败')
  });

  useEffect(() => {
    if (task?.scheduleIntervalHours) {
      setScheduleInterval(String(task.scheduleIntervalHours));
    }
  }, [task?.scheduleIntervalHours]);

  const exportMutation = useMutation({
    mutationFn: () => exportProspectingTask(id)
  });

  const enrichMutation = useMutation({
    mutationFn: (candidateId: string) => enrichProspectProfile(candidateId),
    onMutate: (candidateId) => {
      setEnrichingId(candidateId);
      setEnrichError('');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospecting', 'task', id] });
      qc.invalidateQueries({ queryKey: ['prospecting', 'guard'] });
    },
    onError: (err: Error) => setEnrichError(err.message),
    onSettled: () => setEnrichingId(null)
  });

  if (isLoading) return <LoadingState />;
  if (queryError) {
    return (
      <div className="p-6 text-sm text-destructive">
        获客任务加载失败。
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="ml-2 underline"
        >
          重试
        </Button>
      </div>
    );
  }
  if (!task) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        任务不存在。
        <Link href="/prospecting" className="ml-2 text-primary hover:underline">
          返回列表
        </Link>
      </div>
    );
  }

  const candidatesTotal = candidatesPage?.total ?? 0;
  const convertedCount = candidatesPage?.convertedCount ?? 0;
  const isLegacyTask = !task.strategyPlan;
  const strategies =
    task.strategyPlan?.strategies.map((strategy) => ({
      id: strategy.id,
      title: strategy.title
    })) ?? [];
  const plannedVideos = task.strategyPlan?.limits.maxTotalVideos ?? 0;
  const allowedVideos = guard
    ? Math.min(plannedVideos, guard.videosRemaining)
    : plannedVideos;
  const estimatedMinutes = estimateProspectingMinutes(
    allowedVideos,
    guard?.limits
  );
  // needsLogin intentionally does NOT block the button — the click handler
  // redirects to the platform-account config page instead.
  const runBlocked =
    Boolean(guard && guard.videosRemaining <= 0) ||
    Boolean(guard && guard.captchaWaitMs > 0);
  const runLabel =
    task.status === 'completed' ||
    (task.status === 'failed' && candidatesTotal > 0)
      ? '增量执行'
      : task.status === 'failed'
        ? '重新执行'
        : '开始执行';

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title={task.requirement || '历史获客任务'}
        description={`状态：${statusLabels[task.status] ?? task.status} · 潜客 ${task.totalCandidates} · 已转客户 ${convertedCount} · 评论 ${task.totalComments}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" asChild>
              <Link href="/prospecting">返回列表</Link>
            </Button>
            {task.status !== 'running' && !isLegacyTask && (
              <Button
                variant="secondary"
                onClick={() => {
                  const context =
                    task.requirement ||
                    (task.keywords?.length ? task.keywords.join('，') : '');
                  router.push(
                    `/content/new?source=prospecting${
                      context ? `&topic=${encodeURIComponent(context)}` : ''
                    }`
                  );
                }}
              >
                生成内容
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => exportMutation.mutate()}
              disabled={task.totalCandidates === 0 || exportMutation.isPending}
              loading={exportMutation.isPending}
            >
              {exportMutation.isPending ? '导出中…' : '导出 CSV'}
            </Button>
            {task.status !== 'running' && !isLegacyTask && (
              <Button
                onClick={() => {
                  if (guard?.needsLogin) {
                    if (task.platformAccountId) {
                      void handleBoundAccountRelogin();
                    } else {
                      router.push('/integrations/platforms');
                    }
                    return;
                  }
                  runMutation.mutate();
                }}
                disabled={runMutation.isPending || runBlocked}
                loading={runMutation.isPending}
              >
                {runMutation.isPending ? '提交中…' : runLabel}
              </Button>
            )}
          </div>
        }
      />

      {isLegacyTask && (
        <div className="mb-4 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          这是旧版获客任务，仅保留历史结果查看；请新建智能获客任务执行多策略采集。
        </div>
      )}

      {!isLegacyTask && (
        <section className="mb-4 rounded-md border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">定时执行</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                到期自动入队；额度、验证码或账号失效时跳过并记录原因。
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={task.scheduleEnabled}
                disabled={scheduleMutation.isPending || task.status === 'running'}
                onChange={(event) =>
                  scheduleMutation.mutate(event.target.checked)
                }
              />
              启用
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">间隔</span>
            <NativeSelect
              value={scheduleInterval}
              onChange={(event) => setScheduleInterval(event.target.value)}
              className="rounded border bg-background px-2 py-1"
            >
              <option value="12">12 小时</option>
              <option value="24">24 小时</option>
              <option value="72">3 天</option>
              <option value="168">7 天</option>
            </NativeSelect>
            <Button
              size="xs"
              variant="outline"
              disabled={scheduleMutation.isPending}
              onClick={() => scheduleMutation.mutate(task.scheduleEnabled)}
            >
              保存间隔
            </Button>
            {task.nextRunAt ? (
              <span className="text-xs text-muted-foreground">
                下次执行：{formatDateTime(task.nextRunAt)}
              </span>
            ) : null}
            {task.lastRunAt ? (
              <span className="text-xs text-muted-foreground">
                上次执行：{formatDateTime(task.lastRunAt)}
              </span>
            ) : null}
          </div>
        </section>
      )}

      {convertNotice && (
        <div className="mb-4 rounded-md border border-success/25 bg-success/10 p-3 text-sm text-success">
          {convertNotice.reused
            ? '已关联已有客户。'
            : '已转入客户库，正在生成画像。'}{' '}
          <Link
            href={`/customers/${convertNotice.customerId}`}
            className="underline"
          >
            查看客户
          </Link>
          {convertNotice.leadId && (
            <Link href={`/leads/${convertNotice.leadId}`} className="underline ml-2">查看线索</Link>
          )}
        </div>
      )}

      {task.status === 'running' && (
        <div className="mb-4 rounded-md border border-info/25 bg-info/10 p-4 text-sm text-info space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-block h-2 w-2 rounded-full bg-info animate-pulse flex-shrink-0" />
              <span className="font-medium truncate">
                {formatProspectingProgress(task) || '正在爬取与分析，请稍候…'}
              </span>
            </div>
            <span className="text-xs tabular-nums flex-shrink-0">
              {getProspectingProgressPercent(task)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-info/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-info transition-all duration-500"
              style={{ width: `${getProspectingProgressPercent(task)}%` }}
            />
          </div>
          <p className="text-xs text-info">
            已爬取 {task.totalVideos} 个视频 · {task.totalComments} 条评论
            {task.metadata?.videoTotal
              ? ` · 当前策略视频 ${task.metadata.videoIndex ?? 0}/${task.metadata.videoTotal}`
              : ''}
          </p>
        </div>
      )}

      {task.status === 'completed' && task.metadata?.warning && (
        <div className="mb-4 rounded-md border border-warning/25 bg-warning/10 p-3 text-sm text-warning">
          {task.metadata.warning}
        </div>
      )}

      {task.lastError && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive space-y-2">
          <p>{task.lastError}</p>
          {(task.metadata?.captchaRequired ||
            /验证码/.test(task.lastError)) && (
            <Button
              type="button"
              size="xs"
              onClick={() => setCaptchaOpen(true)}
            >
              打开浏览器过验证码
            </Button>
          )}
        </div>
      )}

      {enrichError && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          主页采集失败：{enrichError}
        </div>
      )}

      {guard && (
        <div className="mb-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            账号
            {guard.platformAccountName
              ? `「${guard.platformAccountName}」`
              : '未登录'}
            ：今日还可爬 {guard.videosRemaining} 个视频、采集{' '}
            {guard.profilesRemaining} 次主页。本次约 {allowedVideos} 个视频 /{' '}
            {estimatedMinutes} 分钟
            {plannedVideos > guard.videosRemaining && guard.videosRemaining > 0
              ? '（额度不足，将自动裁剪）'
              : ''}
            。默认跳过近 {guard.skipTtlDays} 天已抓视频，视频间隔 8–18 秒。
            {guard.health
              ? ` 健康分 ${guard.health.score}（${guard.health.label}）。`
              : ''}
            {guard.captchaWaitMs > 0
              ? ` 验证码冷却中，${Math.ceil(guard.captchaWaitMs / 60000)} 分钟后再跑，或立刻打开浏览器过码。`
              : ''}
            {guard.needsLogin ? ' 请先在「集成配置」完成抖音扫码登录。' : ''}
          </p>
          {guard.needsLogin && task.platformAccountName && (
            <BoundAccountLoginNotice
              platformLabel={platformLabels[task.platform] ?? task.platform}
              accountName={task.platformAccountName}
              onLogin={() => void handleBoundAccountRelogin()}
              pending={boundLoginRestoring}
            />
          )}
          {task.status !== 'running' && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={forceRecrawl}
                  onChange={(e) => setForceRecrawl(e.target.checked)}
                />
                强制重抓近 {guard.skipTtlDays} 天已采集的视频
              </label>
              {guard.platformAccountId && (
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  onClick={() => setCaptchaOpen(true)}
                >
                  打开浏览器过验证码
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-4 text-sm">
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">视频数</p>
          <p className="text-lg font-medium">{task.totalVideos}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">评论数</p>
          <p className="text-lg font-medium">{task.totalComments}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">潜客数</p>
          <p className="text-lg font-medium">{task.totalCandidates}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">已转客户</p>
          <p className="text-lg font-medium">{convertedCount}</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-3 items-center justify-between">
        <ProspectFilterBar
          filters={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
        />
        <span className="text-xs text-muted-foreground">
          共 {candidatesTotal} 位潜客用户 · 点击列表查看详情
        </span>
      </div>

      {candidatesError ? (
        <ErrorState
          message="潜客列表加载失败"
          onRetry={() => refetchCandidates()}
        />
      ) : candidatesLoading ? (
        <LoadingState />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
          <div className="min-w-0">
            <div className="space-y-1">
              {candidates.map((c) => (
                <ProspectListRow
                  key={c.id}
                  candidate={c}
                  selected={c.id === selectedId}
                  onSelect={handleSelect}
                />
              ))}
            </div>
            {candidates.length === 0 &&
              (hasActiveProspectFilters(filters) ? (
                <EmptyState
                  title="没有符合筛选条件的潜客"
                  description="试试放宽关键词、降低相关度要求，或重置筛选"
                  action={{
                    label: '重置筛选',
                    onClick: () => {
                      setFilters(emptyProspectFilters);
                      setPage(1);
                    }
                  }}
                />
              ) : (
                <div className="rounded-lg border px-4 py-8 text-center text-muted-foreground text-sm">
                  {task.status === 'running'
                    ? '正在爬取与分析，请稍候…'
                    : '暂无潜客结果，点击「开始执行」开始任务'}
                </div>
              ))}
            <DataTablePagination
              page={page}
              pageSize={pageSize}
              total={candidatesTotal}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
          <div className="hidden lg:block lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            {selectedItem ? (
              <ProspectDetailPanel
                candidate={selectedItem}
                strategies={strategies}
                enrichBusy={enrichBusy(selectedItem, enrichingId)}
                onEnrich={(candidateId) => enrichMutation.mutate(candidateId)}
                onConvert={setConvertTarget}
              />
            ) : (
              <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
                从左侧选择潜客查看详情
              </div>
            )}
          </div>
        </div>
      )}

      {mobileDetailOpen && selectedItem && (
        <MobileDetailOverlay onClose={() => setMobileDetailOpen(false)}>
          <ProspectDetailPanel
            candidate={selectedItem}
            strategies={strategies}
            enrichBusy={enrichBusy(selectedItem, enrichingId)}
            onEnrich={(candidateId) => enrichMutation.mutate(candidateId)}
            onConvert={setConvertTarget}
          />
        </MobileDetailOverlay>
      )}

      {captchaOpen && task.platformAccountId && (
        <CaptchaSolveDialog
          platformAccountId={task.platformAccountId}
          onClose={() => setCaptchaOpen(false)}
          onSolved={() => {
            setCaptchaOpen(false);
            qc.invalidateQueries({ queryKey: ['prospecting'] });
          }}
        />
      )}
      {boundLoginOpen && task.platformAccountId && (
        <BrowserLoginDialog
          accountId={task.platformAccountId}
          platform={task.platform}
          open={boundLoginOpen}
          onClose={() => {
            setBoundLoginOpen(false);
            qc.invalidateQueries({ queryKey: ['prospecting'] });
          }}
        />
      )}
      {convertTarget && (
        <ConvertDialog
          candidate={convertTarget}
          onClose={() => setConvertTarget(null)}
          onDone={(result) => {
            setConvertTarget(null);
            setConvertNotice(result);
            qc.invalidateQueries({ queryKey: ['prospecting', 'task', id] });
            qc.invalidateQueries({ queryKey: ['customers'] });
          }}
        />
      )}
    </div>
  );
}
