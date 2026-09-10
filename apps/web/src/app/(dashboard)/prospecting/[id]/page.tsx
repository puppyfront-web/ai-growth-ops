'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getProspectingTask,
  runProspectingTask,
  exportProspectingTask,
  convertProspectToCustomer,
  enrichProspectProfile,
  getProspectingGuard,
  estimateProspectingMinutes,
  startProspectingCaptcha,
  getProspectingCaptchaStatus,
  cancelProspectingCaptcha,
  resolveProspectingCaptcha,
  formatProspectingProgress,
  getProspectingProgressPercent,
  type ProspectCandidate,
  type ProspectEvidence,
  type ProspectUserProfile
} from '@/lib/api/prospecting';
import { ApiError } from '@/lib/api/client';
import type { CustomerDuplicate } from '@/types/customer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';

const statusLabels: Record<string, string> = {
  draft: '草稿',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消'
};

const levelLabels: Record<string, string> = {
  A: '高意向',
  B: '中意向',
  C: '低意向',
  D: '无效'
};

function candidateComments(candidate: ProspectCandidate): ProspectEvidence[] {
  const list =
    candidate.evidence && candidate.evidence.length > 0
      ? candidate.evidence
      : [
          {
            content: candidate.content,
            sourceVideoTitle: candidate.sourceVideoTitle,
            sourceVideoUrl: candidate.sourceVideoUrl,
            publishedAt: null,
            likeCount: null
          }
        ];
  return [...list].sort((a, b) => {
    if (a.content === candidate.content && b.content !== candidate.content) {
      return -1;
    }
    if (b.content === candidate.content && a.content !== candidate.content) {
      return 1;
    }
    return (b.likeCount ?? 0) - (a.likeCount ?? 0);
  });
}

function formatCount(value: number | null | undefined): string {
  if (value == null) return '-';
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return String(value);
}

function ProfileSummary({ profile }: { profile: ProspectUserProfile }) {
  return (
    <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs space-y-1">
      {profile.signature && <p className="whitespace-pre-wrap">{profile.signature}</p>}
      <p className="text-muted-foreground">
        粉丝 {formatCount(profile.followerCount)} · 关注{' '}
        {formatCount(profile.followingCount)} · 获赞 {formatCount(profile.likeCount)}
        {profile.location ? ` · ${profile.location}` : ''}
      </p>
    </div>
  );
}

function ConvertDialog({
  candidate,
  onClose,
  onDone
}: {
  candidate: ProspectCandidate;
  onClose: () => void;
  onDone: (result: { reused: boolean; customerId: string }) => void;
}) {
  const comments = candidateComments(candidate);
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState(candidate.userNickname ?? '');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [intent, setIntent] = useState(
    candidate.summary || candidate.content.slice(0, 200)
  );
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [duplicates, setDuplicates] = useState<CustomerDuplicate[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: () =>
      convertProspectToCustomer(candidate.id, {
        phone: phone.trim() || undefined,
        displayName,
        company: company || undefined,
        role: role || undefined,
        intent,
        confirmDuplicate
      }),
    onSuccess: (result) =>
      onDone({ reused: result.reused, customerId: result.customer.id }),
    onError: (err: Error) => {
      if (err instanceof ApiError && err.status === 409) {
        const items = Array.isArray(err.payload.duplicates)
          ? (err.payload.duplicates as CustomerDuplicate[])
          : [];
        setDuplicates(items);
        setConfirmDuplicate(true);
        setError('手机号已存在，确认仍要新建？');
        return;
      }
      setError(err.message);
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="convert-prospect-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border bg-background p-5 shadow-lg space-y-3"
      >
        <h3 id="convert-prospect-title" className="font-medium">
          转入客户库
        </h3>
        <p className="text-xs text-muted-foreground">
          平台拿不到手机号，可直接转入，后续由销售人工跟进补充。
        </p>
        <p className="text-sm font-medium">
          {candidate.userNickname ?? '未知用户'}
        </p>
        {candidate.metadata?.profile && (
          <ProfileSummary profile={candidate.metadata.profile} />
        )}
        <div className="space-y-1.5 rounded-md border p-2">
          <p className="text-xs text-muted-foreground">
            已采集评论 {comments.length} 条
          </p>
          {comments.map((item, index) => (
            <p key={`${item.content}-${index}`} className="text-xs">
              {index === 0 && (
                <span className="mr-1 rounded bg-primary/10 px-1 text-primary">
                  优先
                </span>
              )}
              {item.content}
            </p>
          ))}
        </div>
        <label htmlFor="prospect-name" className="sr-only">
          姓名
        </label>
        <input
          id="prospect-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="姓名"
          className="w-full rounded border px-2 py-1.5 text-sm"
        />
        <label htmlFor="prospect-phone" className="sr-only">
          手机号（选填）
        </label>
        <input
          id="prospect-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="手机号（选填，后续人工补充）"
          className="w-full rounded border px-2 py-1.5 text-sm"
        />
        <label htmlFor="prospect-company" className="sr-only">
          公司
        </label>
        <input
          id="prospect-company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="公司（选填）"
          className="w-full rounded border px-2 py-1.5 text-sm"
        />
        <label htmlFor="prospect-role" className="sr-only">
          职位
        </label>
        <input
          id="prospect-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="职位（选填）"
          className="w-full rounded border px-2 py-1.5 text-sm"
        />
        <label htmlFor="prospect-intent" className="sr-only">
          需求
        </label>
        <textarea
          id="prospect-intent"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          rows={2}
          placeholder="需求"
          className="w-full rounded border px-2 py-1.5 text-sm"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {duplicates.length > 0 && (
          <ul className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            {duplicates.map((item) => (
              <li key={item.id}>
                <div className="font-medium">
                  {item.displayName} · {item.phone || '待补充'}
                </div>
                <div className="text-muted-foreground">
                  {item.company} · {item.role}
                </div>
                <Link
                  href={`/customers/${item.id}`}
                  className="text-xs text-primary hover:underline"
                >
                  查看已有客户
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded border px-3 py-1.5 text-sm"
          >
            取消
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {confirmDuplicate ? '仍要新建' : '确认转入'}
          </button>
        </div>
      </div>
    </div>
  );
}

function enrichBusy(candidate: ProspectCandidate, enrichingId: string | null) {
  return (
    enrichingId === candidate.id ||
    candidate.metadata?.enrichStatus === 'queued' ||
    candidate.metadata?.enrichStatus === 'running'
  );
}

function CaptchaSolveDialog({
  onClose,
  onSolved
}: {
  onClose: () => void;
  onSolved: () => void;
}) {
  const [status, setStatus] = useState<'starting' | 'waiting' | 'solved' | 'error'>(
    'starting'
  );
  const [error, setError] = useState('');
  const onSolvedRef = useRef(onSolved);
  onSolvedRef.current = onSolved;
  const skipCancelRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const start = async () => {
      try {
        await startProspectingCaptcha();
        if (cancelled) return;
        setStatus('waiting');
        timer = setInterval(async () => {
          try {
            const result = await getProspectingCaptchaStatus();
            if (cancelled) return;
            if (result.status === 'solved') {
              if (timer) clearInterval(timer);
              setStatus('solved');
              skipCancelRef.current = true;
              onSolvedRef.current();
            } else if (result.status === 'expired') {
              if (timer) clearInterval(timer);
              setStatus('error');
              setError(result.error || '过码超时，请重试或点「我已完成验证」');
            }
          } catch (err) {
            if (cancelled) return;
            if (timer) clearInterval(timer);
            setStatus('error');
            setError((err as Error).message);
          }
        }, 2500);
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setError((err as Error).message);
      }
    };
    start();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (!skipCancelRef.current) {
        cancelProspectingCaptcha().catch(() => undefined);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="captcha-solve-title"
        className="w-full max-w-md rounded-lg border bg-background p-5 space-y-3"
      >
        <h3 id="captcha-solve-title" className="font-medium">
          完成平台验证码
        </h3>
        <p className="text-sm text-muted-foreground">
          {status === 'starting' && '正在打开本机浏览器窗口…'}
          {status === 'waiting' &&
            '请在弹出的浏览器里完成验证，完成后这里会自动解除冷却。'}
          {status === 'solved' && '验证已通过，可以继续增量执行。'}
          {status === 'error' && (error || '过码失败')}
        </p>
        <div className="flex justify-end gap-2">
          {status !== 'solved' && (
            <button
              type="button"
              onClick={async () => {
                skipCancelRef.current = true;
                await resolveProspectingCaptcha();
                onSolved();
              }}
              className="rounded border px-3 py-1.5 text-sm hover:bg-accent"
            >
              我已完成验证
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            {status === 'solved' ? '关闭' : '取消'}
          </button>
        </div>
      </div>
    </div>
  );
}

function groupByUser(candidates: ProspectCandidate[]) {
  const map = new Map<
    string,
    { key: string; best: ProspectCandidate; all: ProspectCandidate[] }
  >();
  for (const c of candidates) {
    const key = c.userKey || c.externalUserId || c.userNickname || c.id;
    if (!map.has(key)) {
      map.set(key, { key, best: c, all: [c] });
    } else {
      const entry = map.get(key)!;
      entry.all.push(c);
      if (c.relevanceScore > entry.best.relevanceScore) entry.best = c;
    }
  }
  return [...map.values()].sort(
    (a, b) => b.best.relevanceScore - a.best.relevanceScore
  );
}

function ConvertedBadge({ customerId }: { customerId: string }) {
  return (
    <Link
      href={`/customers/${customerId}`}
      className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-200"
    >
      已转客户
    </Link>
  );
}

export default function ProspectingDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const qc = useQueryClient();
  const [convertTarget, setConvertTarget] = useState<ProspectCandidate | null>(
    null
  );
  const [viewMode, setViewMode] = useState<'list' | 'user'>('user');
  const [minScoreFilter, setMinScoreFilter] = useState(0);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [enrichError, setEnrichError] = useState('');
  const [forceRecrawl, setForceRecrawl] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [convertNotice, setConvertNotice] = useState<{
    reused: boolean;
    customerId: string;
  } | null>(null);

  const {
    data: task,
    isLoading,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: ['prospecting', 'task', id],
    queryFn: () => getProspectingTask(id),
    refetchInterval: (q) => {
      const current = q.state.data;
      if (current?.status === 'running') return 3000;
      if (
        (current?.candidates ?? []).some(
          (item) =>
            item.metadata?.enrichStatus === 'queued' ||
            item.metadata?.enrichStatus === 'running'
        )
      ) {
        return 3000;
      }
      return false;
    }
  });

  const { data: guard } = useQuery({
    queryKey: ['prospecting', 'guard'],
    queryFn: () => getProspectingGuard()
  });

  const runMutation = useMutation({
    mutationFn: () => runProspectingTask(id, forceRecrawl),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['prospecting', 'task', id] })
  });

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
        <button onClick={() => refetch()} className="ml-2 underline">
          重试
        </button>
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

  const keywords = (task.keywords as string[]) ?? [];
  const allCandidates = task.candidates ?? [];
  const candidates =
    minScoreFilter > 0
      ? allCandidates.filter((c) => c.relevanceScore >= minScoreFilter)
      : allCandidates;
  const userGroups = groupByUser(candidates);
  const convertedCount = allCandidates.filter((c) => c.customerId).length;
  const plannedVideos = keywords.length * task.topNVideos;
  const allowedVideos = guard
    ? Math.min(plannedVideos, guard.videosRemaining)
    : plannedVideos;
  const estimatedMinutes = estimateProspectingMinutes(
    allowedVideos,
    guard?.limits
  );
  const runBlocked =
    Boolean(guard?.needsLogin) ||
    Boolean(guard && guard.videosRemaining <= 0) ||
    Boolean(guard && guard.captchaWaitMs > 0);
  const runLabel =
    task.status === 'completed' ||
    (task.status === 'failed' && allCandidates.length > 0)
      ? '增量执行'
      : task.status === 'failed'
        ? '重新执行'
        : '开始执行';

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title={keywords.join('、') || '获客任务'}
        description={`状态：${statusLabels[task.status] ?? task.status} · 潜客 ${task.totalCandidates} · 已转客户 ${convertedCount} · 评论 ${task.totalComments}`}
        actions={
          <div className="flex gap-2">
            <Link
              href="/prospecting"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            >
              返回列表
            </Link>
            <button
              onClick={() => exportMutation.mutate()}
              disabled={candidates.length === 0 || exportMutation.isPending}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            >
              {exportMutation.isPending ? '导出中…' : '导出 CSV'}
            </button>
            {task.status !== 'running' && (
              <button
                onClick={() => runMutation.mutate()}
                disabled={runMutation.isPending || runBlocked}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
              >
                {runMutation.isPending ? '提交中…' : runLabel}
              </button>
            )}
          </div>
        }
      />

      {convertNotice && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {convertNotice.reused
            ? '已关联已有客户，可继续跟进。'
            : '已转入客户库，正在生成画像与跟进方案。'}{' '}
          <Link
            href={`/customers/${convertNotice.customerId}`}
            className="underline"
          >
            查看客户
          </Link>
        </div>
      )}

      {task.status === 'running' && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
              <span className="font-medium truncate">
                {formatProspectingProgress(task) || '正在爬取与分析，请稍候…'}
              </span>
            </div>
            <span className="text-xs tabular-nums flex-shrink-0">
              {getProspectingProgressPercent(task)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${getProspectingProgressPercent(task)}%` }}
            />
          </div>
          <p className="text-xs text-blue-700/80">
            已爬取 {task.totalVideos} 个视频 · {task.totalComments} 条评论
            {task.metadata?.videoTotal
              ? ` · 当前关键词视频 ${task.metadata.videoIndex ?? 0}/${task.metadata.videoTotal}`
              : ''}
          </p>
        </div>
      )}

      {task.status === 'completed' && task.metadata?.warning && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {task.metadata.warning}
        </div>
      )}

      {task.lastError && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive space-y-2">
          <p>{task.lastError}</p>
          {(task.metadata?.captchaRequired ||
            /验证码/.test(task.lastError)) && (
            <button
              type="button"
              onClick={() => setCaptchaOpen(true)}
              className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground"
            >
              打开浏览器过验证码
            </button>
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
            账号{guard.platformAccountName ? `「${guard.platformAccountName}」` : '未登录'}
            ：今日还可爬 {guard.videosRemaining} 个视频、采集 {guard.profilesRemaining}{' '}
            次主页。本次约 {allowedVideos} 个视频 / {estimatedMinutes} 分钟
            {plannedVideos > guard.videosRemaining && guard.videosRemaining > 0
              ? '（额度不足，将自动裁剪）'
              : ''}
            。默认跳过近 {guard.skipTtlDays} 天已抓视频，视频间隔 8–18 秒。
            {guard.health ? ` 健康分 ${guard.health.score}（${guard.health.label}）。` : ''}
            {guard.captchaWaitMs > 0
              ? ` 验证码冷却中，${Math.ceil(guard.captchaWaitMs / 60000)} 分钟后再跑，或立刻打开浏览器过码。`
              : ''}
            {guard.needsLogin ? ' 请先在「集成配置」完成抖音扫码登录。' : ''}
          </p>
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
                <button
                  type="button"
                  onClick={() => setCaptchaOpen(true)}
                  className="text-xs text-primary hover:underline"
                >
                  打开浏览器过验证码
                </button>
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

      <div className="mb-3 flex flex-wrap gap-3 items-center text-sm">
        <div className="flex items-center gap-2">
          <label htmlFor="score-filter" className="text-muted-foreground text-xs">
            最低相关度
          </label>
          <input
            id="score-filter"
            type="number"
            min={0}
            max={100}
            value={minScoreFilter}
            onChange={(e) => setMinScoreFilter(Number(e.target.value))}
            className="w-16 rounded border bg-background px-2 py-1 text-xs"
          />
        </div>
        <div className="flex rounded-md border overflow-hidden">
          <button
            onClick={() => setViewMode('user')}
            className={`px-3 py-1 text-xs ${viewMode === 'user' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
          >
            用户视图
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 text-xs ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
          >
            评论列表
          </button>
        </div>
        <span className="text-xs text-muted-foreground">
          {viewMode === 'user'
            ? `共 ${userGroups.length} 位潜客用户`
            : `共 ${candidates.length} 条记录`}
        </span>
        <span className="text-xs text-muted-foreground">
          点击头像采集主页资料
        </span>
      </div>

      {viewMode === 'user' ? (
        <div className="space-y-3">
          {userGroups.map((group) => {
            const c = group.best;
            const comments = candidateComments(c);
            const converted = group.all.find((item) => item.customerId)?.customerId;
            return (
              <div key={group.key} className="rounded-lg border">
                <div className="flex gap-3 p-4 items-start">
                  <button
                    type="button"
                    title={
                      c.userHomepage
                        ? '点击采集主页资料'
                        : '暂无主页链接，无法采集'
                    }
                    disabled={!c.userHomepage || enrichBusy(c, enrichingId)}
                    onClick={() => enrichMutation.mutate(c.id)}
                    className="flex-shrink-0 rounded-full disabled:opacity-50"
                  >
                    {c.avatarUrl ? (
                      <img
                        src={c.avatarUrl}
                        alt={c.userNickname ?? '用户头像'}
                        className="w-10 h-10 rounded-full object-cover ring-2 ring-transparent hover:ring-primary"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs">
                        {enrichBusy(c, enrichingId) ? '…' : '采集'}
                      </span>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {c.userNickname ?? '未知用户'}
                      </span>
                      {c.userHomepage && (
                        <a
                          href={c.userHomepage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          主页 ↗
                        </a>
                      )}
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          c.leadLevel === 'A'
                            ? 'bg-green-100 text-green-700'
                            : c.leadLevel === 'B'
                              ? 'bg-blue-100 text-blue-700'
                              : c.leadLevel === 'C'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {levelLabels[c.leadLevel] ?? c.leadLevel}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        相关度 {c.relevanceScore}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {c.scoreSource === 'skill' ? '语义评分' : '规则评分'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {comments.length} 条评论
                      </span>
                    </div>
                    {c.summary && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {c.leadLevel === 'A' || c.leadLevel === 'B'
                          ? `为什么是${c.leadLevel}：${c.summary}`
                          : c.summary}
                      </p>
                    )}
                    {(c.matchedKeywords?.length ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        匹配：{c.matchedKeywords?.join('、')}
                      </p>
                    )}
                    {c.metadata?.profile && (
                      <ProfileSummary profile={c.metadata.profile} />
                    )}
                    {(enrichBusy(c, enrichingId) ||
                      c.metadata?.enrichStatus === 'failed') && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {c.metadata?.enrichStatus === 'queued'
                          ? '主页采集排队中，等当前爬取结束后开始…'
                          : c.metadata?.enrichStatus === 'running'
                            ? '正在打开主页采集资料…'
                            : c.metadata?.enrichError
                              ? `主页采集失败：${c.metadata.enrichError}`
                              : '正在打开主页采集资料…'}
                      </p>
                    )}
                    <div className="mt-2 space-y-2">
                      {comments.map((item, index) => (
                        <div
                          key={`${item.content}-${index}`}
                          className="rounded-md border px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {index === 0 && (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                优先跟进
                              </span>
                            )}
                            {item.likeCount != null && item.likeCount > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {item.likeCount} 赞
                              </span>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap">{item.content}</p>
                          <p className="text-xs mt-1 text-muted-foreground">
                            关键词：{c.keyword}
                            {item.sourceVideoTitle
                              ? ` · 来源：${item.sourceVideoTitle}`
                              : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {converted ? (
                      <ConvertedBadge customerId={converted} />
                    ) : (
                      <button
                        onClick={() => setConvertTarget(c)}
                        className="rounded border px-2 py-1 text-xs hover:bg-accent"
                      >
                        转客户
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {userGroups.length === 0 && (
            <div className="rounded-lg border px-4 py-8 text-center text-muted-foreground text-sm">
              {task.status === 'running'
                ? '正在爬取与分析，请稍候…'
                : '暂无潜客结果，点击「开始执行」开始任务'}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3">用户</th>
                <th className="text-left px-4 py-3">评论</th>
                <th className="text-left px-4 py-3">来源视频</th>
                <th className="text-left px-4 py-3">相关度</th>
                <th className="text-left px-4 py-3">意向</th>
                <th className="text-left px-4 py-3">状态</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const comments = candidateComments(c);
                return (
                  <tr key={c.id} className="border-b last:border-0 align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!c.userHomepage || enrichBusy(c, enrichingId)}
                          onClick={() => enrichMutation.mutate(c.id)}
                          className="flex-shrink-0"
                          title="点击采集主页资料"
                        >
                          {c.avatarUrl ? (
                            <img
                              src={c.avatarUrl}
                              alt=""
                              className="w-7 h-7 rounded-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  'none';
                              }}
                            />
                          ) : (
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px]">
                              头
                            </span>
                          )}
                        </button>
                        <div>
                          <p>{c.userNickname ?? '未知'}</p>
                          {c.userHomepage && (
                            <a
                              href={c.userHomepage}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              主页
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-md">
                      <div className="space-y-2">
                        {comments.map((item, index) => (
                          <div key={`${c.id}-${index}`}>
                            {index === 0 && (
                              <span className="mr-1 text-[10px] text-primary">
                                优先
                              </span>
                            )}
                            <span>{item.content}</span>
                          </div>
                        ))}
                      </div>
                      {c.summary && (
                        <p className="text-xs mt-1 text-muted-foreground italic">
                          {c.summary}
                        </p>
                      )}
                      <p className="text-xs mt-1">关键词：{c.keyword}</p>
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <p>{c.sourceVideoTitle ?? '-'}</p>
                      {c.sourceVideoAuthor && (
                        <p className="text-xs text-muted-foreground">
                          @{c.sourceVideoAuthor}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium">
                      {c.relevanceScore}
                    </td>
                    <td className="px-4 py-3">
                      {levelLabels[c.leadLevel] ?? c.leadLevel}
                    </td>
                    <td className="px-4 py-3">
                      {c.customerId ? (
                        <ConvertedBadge customerId={c.customerId} />
                      ) : (
                        <button
                          onClick={() => setConvertTarget(c)}
                          className="rounded border px-2 py-1 text-xs hover:bg-accent"
                        >
                          转客户
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {candidates.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    {task.status === 'running'
                      ? '正在爬取与分析，请稍候…'
                      : '暂无潜客结果，点击「开始执行」开始任务'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {captchaOpen && (
        <CaptchaSolveDialog
          onClose={() => setCaptchaOpen(false)}
          onSolved={() => {
            setCaptchaOpen(false);
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
