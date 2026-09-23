'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  createProspectingTask,
  analyzeProspectingRequirement,
  runProspectingTask,
  listProspectingTasks,
  listProspectingAccounts,
  PROSPECTING_SUPPORTED_PLATFORMS,
  formatProspectingProgress,
  getProspectingProgressPercent,
  isAccountLoginRequiredError,
  type ProspectingPlatform,
  type ProspectingPlanAnalysis
} from '@/lib/api/prospecting';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { formatDate } from '@/lib/utils';
import { getLlmConfig } from '@/lib/api/settings';

const platformLabels: Record<ProspectingPlatform, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat_official: '微信公众号',
  wechat_channels: '视频号',
  baijiahao: '百家号',
  zhihu: '知乎'
};

const statusLabels: Record<string, string> = {
  draft: '草稿',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消'
};

export default function ProspectingPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [platform, setPlatform] = useState<ProspectingPlatform>('douyin');
  const [requirement, setRequirement] = useState('');
  const [platformAccountId, setPlatformAccountId] = useState('');
  const [analysis, setAnalysis] = useState<ProspectingPlanAnalysis | null>(
    null
  );
  const [enabledStrategyIds, setEnabledStrategyIds] = useState<string[]>([]);
  const [minScore, setMinScore] = useState(40);
  const [page, setPage] = useState(1);

  const { data: accounts = [] } = useQuery({
    queryKey: ['prospecting', 'accounts', platform],
    queryFn: () => listProspectingAccounts(platform)
  });
  const guard = accounts.find(
    (account) => account.platformAccountId === platformAccountId
  );

  useEffect(() => {
    if (accounts.length === 1) {
      setPlatformAccountId(accounts[0]?.platformAccountId ?? '');
    } else if (
      !accounts.some(
        (account) => account.platformAccountId === platformAccountId
      )
    ) {
      setPlatformAccountId('');
    }
  }, [accounts, platformAccountId]);

  const { data: llmConfig } = useQuery({
    queryKey: ['settings', 'llm'],
    queryFn: getLlmConfig
  });
  const llmMissing =
    llmConfig !== undefined && llmConfig.effectiveConfigured === false;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['prospecting', 'tasks', page],
    queryFn: () => listProspectingTasks(page),
    refetchInterval: (q) =>
      (q.state.data?.items ?? []).some((t) => t.status === 'running')
        ? 3000
        : false
  });

  const analyzeMutation = useMutation({
    mutationFn: () =>
      analyzeProspectingRequirement(requirement, platform, platformAccountId),
    onSuccess: (result) => {
      setAnalysis(result);
      setEnabledStrategyIds(
        result.plan.strategies
          .filter((strategy) => strategy.enabled)
          .map((strategy) => strategy.id)
      );
    }
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      // 未登录自媒体账号时直接引导去账号配置页，不再创建注定失败的任务
      if (guard?.needsLogin) {
        router.push('/integrations/platforms');
        throw new Error('请先扫码登录自媒体账号');
      }
      if (!analysis) throw new Error('请先分析获客需求');
      const task = await createProspectingTask({
        planId: analysis.planId,
        enabledStrategyIds,
        minRelevanceScore: minScore
      });
      try {
        await runProspectingTask(task.id);
      } catch (err) {
        if (err instanceof Error && isAccountLoginRequiredError(err.message)) {
          router.push('/integrations/platforms');
          throw err;
        }
        /* detail page surfaces login / retry */
      }
      return task;
    },
    onSuccess: (task) => {
      setShowCreate(false);
      setRequirement('');
      setAnalysis(null);
      setEnabledStrategyIds([]);
      qc.invalidateQueries({ queryKey: ['prospecting'] });
      window.location.href = `/prospecting/${task.id}`;
    }
  });

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="智能获客"
        description="描述目标客户和业务需求，由系统组合多种策略发现高意向潜客"
        actions={
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            + 新建任务
          </button>
        }
      />

      {llmMissing && (
        <div className="mb-6 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-amber-800">
              尚未配置 LLM，无法分析获客需求
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              配置 API Key
              后，系统会识别目标客户、购买信号与排除对象，并生成多策略采集计划。
            </p>
          </div>
          <Link
            href="/integrations/llm"
            className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-amber-700"
          >
            去配置 LLM →
          </Link>
        </div>
      )}

      {showCreate && (
        <div className="mb-6 rounded-lg border bg-muted/30 p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label
                htmlFor="prospecting-platform"
                className="block text-xs text-muted-foreground mb-1"
              >
                目标平台
              </label>
              <select
                id="prospecting-platform"
                value={platform}
                onChange={(e) => {
                  setPlatform(e.target.value as ProspectingPlatform);
                  setPlatformAccountId('');
                  setAnalysis(null);
                }}
                className="w-full rounded border bg-background px-2 py-1.5 text-sm"
              >
                {PROSPECTING_SUPPORTED_PLATFORMS.map((value) => (
                  <option key={value} value={value}>
                    {platformLabels[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="prospecting-account"
                className="block text-xs text-muted-foreground mb-1"
              >
                执行账号
              </label>
              <select
                id="prospecting-account"
                value={platformAccountId}
                onChange={(event) => {
                  setPlatformAccountId(event.target.value);
                  setAnalysis(null);
                }}
                className="w-full rounded border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">
                  {accounts.length > 1 ? '请选择抖音账号' : '暂无可用账号'}
                </option>
                {accounts.map((account) => (
                  <option
                    key={account.platformAccountId}
                    value={account.platformAccountId ?? ''}
                  >
                    {account.platformAccountName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="prospecting-min-score"
                className="block text-xs text-muted-foreground mb-1"
              >
                最低相关度
              </label>
              <input
                id="prospecting-min-score"
                type="number"
                min={0}
                max={100}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-full rounded border bg-background px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="prospecting-requirement"
              className="block text-xs text-muted-foreground mb-1"
            >
              描述你想寻找的客户*
            </label>
            <textarea
              id="prospecting-requirement"
              value={requirement}
              onChange={(e) => {
                setRequirement(e.target.value);
                setAnalysis(null);
              }}
              rows={4}
              placeholder="例如：寻找正在考虑采购私域运营工具的中小企业负责人，优先零售和教育行业，排除同行、代运营服务商和求职者。"
              className="w-full rounded border bg-background px-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            系统会识别目标客户、业务场景、购买信号和排除对象，再组合多种采集策略。账号每天最多爬{' '}
            {guard?.limits.dailyVideoLimit ?? 60} 个视频、采集{' '}
            {guard?.limits.dailyProfileLimit ?? 24} 次主页。
            {guard?.platformAccountName
              ? ` 当前账号「${guard.platformAccountName}」${guard.health ? ` · ${guard.health.label} ${guard.health.score}` : ''}。`
              : ''}
            今日剩余 {guard?.videosRemaining ?? '-'} 个视频额度
            {analysis
              ? `，本次最多 ${analysis.plan.limits.maxTotalVideos} 个视频 / 约 ${analysis.guard.estimatedMinutes} 分钟`
              : ''}
            {guard && guard.captchaWaitMs > 0
              ? `，验证码冷却 ${Math.ceil(guard.captchaWaitMs / 60000)} 分钟`
              : ''}
            {accounts.length === 0
              ? '。请先在「集成配置」完成抖音扫码登录'
              : ''}
            。近 {guard?.skipTtlDays ?? 7} 天已抓视频默认跳过。
          </p>
          {analysis && (
            <div className="space-y-3 rounded-lg border bg-background p-4">
              <div>
                <p className="text-sm font-medium">需求理解</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {analysis.plan.intent.summary}
                </p>
              </div>
              {analysis.plan.intent.ambiguities.length > 0 && (
                <p className="text-xs text-amber-700">
                  待确认：{analysis.plan.intent.ambiguities.join('；')}
                </p>
              )}
              <div className="grid gap-2 md:grid-cols-2">
                {analysis.plan.strategies.map((strategy) => {
                  const checked = enabledStrategyIds.includes(strategy.id);
                  return (
                    <label
                      key={strategy.id}
                      className="flex gap-3 rounded-md border p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setEnabledStrategyIds((current) =>
                            checked
                              ? current.filter((id) => id !== strategy.id)
                              : [...current, strategy.id]
                          )
                        }
                      />
                      <span>
                        <span className="font-medium">{strategy.title}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {strategy.rationale} · 最多{' '}
                          {strategy.budget.maxVideos} 个视频
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            {!analysis ? (
              <button
                onClick={() => analyzeMutation.mutate()}
                disabled={
                  requirement.trim().length < 20 ||
                  !platformAccountId ||
                  analyzeMutation.isPending ||
                  llmMissing
                }
                className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              >
                {analyzeMutation.isPending ? '分析中…' : '分析需求'}
              </button>
            ) : (
              <button
                onClick={() => createMutation.mutate()}
                disabled={
                  enabledStrategyIds.length < 2 || createMutation.isPending
                }
                className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              >
                {createMutation.isPending ? '创建中…' : '确认并开始获客'}
              </button>
            )}
            <button
              onClick={() => setShowCreate(false)}
              className="rounded border px-4 py-2 text-sm hover:bg-accent"
            >
              取消
            </button>
          </div>
          {createMutation.isError && (
            <p className="text-sm text-destructive">
              {(createMutation.error as Error).message}
            </p>
          )}
          {analyzeMutation.isError && (
            <p className="text-sm text-destructive">
              {(analyzeMutation.error as Error).message}
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <div className="text-sm text-destructive">
          获客任务加载失败。
          <button onClick={() => refetch()} className="ml-2 underline">
            重试
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">获客需求</th>
                  <th className="text-left px-4 py-3 font-medium">平台</th>
                  <th className="text-left px-4 py-3 font-medium">状态</th>
                  <th className="text-left px-4 py-3 font-medium">进度</th>
                  <th className="text-left px-4 py-3 font-medium">潜客数</th>
                  <th className="text-left px-4 py-3 font-medium">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((task) => (
                  <tr
                    key={task.id}
                    className="border-b last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/prospecting/${task.id}`}
                        className="font-medium hover:underline"
                      >
                        {task.requirement || '历史获客任务'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {platformLabels[task.platform] ?? task.platform}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {task.status === 'running' && (
                          <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                        )}
                        <span>{statusLabels[task.status] ?? task.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      {task.status === 'running' ? (
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {formatProspectingProgress(task) || '执行中…'}
                          </p>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                                style={{
                                  width: `${getProspectingProgressPercent(task)}%`
                                }}
                              />
                            </div>
                            <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">
                              {getProspectingProgressPercent(task)}%
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {task.totalVideos} 视频 · {task.totalComments} 评论
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {formatProspectingProgress(task) ||
                            (task.status === 'completed'
                              ? `视频 ${task.totalVideos} · 评论 ${task.totalComments}`
                              : '-')}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {task.totalCandidates}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(task.createdAt)}
                    </td>
                  </tr>
                ))}
                {(data?.items ?? []).length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      暂无获客任务，点击「新建任务」开始
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {(data?.totalPages ?? 0) > 1 && (
            <div className="mt-4 flex items-center justify-end gap-3 text-sm">
              <button
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1}
                className="rounded border px-3 py-1.5 disabled:opacity-50"
              >
                上一页
              </button>
              <span>
                第 {page} / {data?.totalPages} 页
              </span>
              <button
                onClick={() => setPage((value) => value + 1)}
                disabled={page >= (data?.totalPages ?? 1)}
                className="rounded border px-3 py-1.5 disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
