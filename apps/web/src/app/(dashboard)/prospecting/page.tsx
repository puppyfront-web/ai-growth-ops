'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  createProspectingTask,
  runProspectingTask,
  listProspectingTasks,
  getProspectingGuard,
  estimateProspectingMinutes,
  PROSPECTING_SUPPORTED_PLATFORMS,
  formatProspectingProgress,
  getProspectingProgressPercent,
  type ProspectingPlatform
} from '@/lib/api/prospecting';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { formatDate } from '@/lib/utils';

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
  const [showCreate, setShowCreate] = useState(false);
  const [platform, setPlatform] = useState<ProspectingPlatform>('douyin');
  const [keywordsText, setKeywordsText] = useState('');
  const [topNVideos, setTopNVideos] = useState(5);
  const [minScore, setMinScore] = useState(40);
  const [page, setPage] = useState(1);

  const { data: guard } = useQuery({
    queryKey: ['prospecting', 'guard'],
    queryFn: () => getProspectingGuard()
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['prospecting', 'tasks', page],
    queryFn: () => listProspectingTasks(page),
    refetchInterval: (q) =>
      (q.state.data?.items ?? []).some((t) => t.status === 'running')
        ? 3000
        : false
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const keywords = keywordsText
        .split(/[,，\n]/)
        .map((k) => k.trim())
        .filter(Boolean);
      const task = await createProspectingTask({
        platform,
        keywords,
        topNVideos,
        minRelevanceScore: minScore
      });
      try {
        await runProspectingTask(task.id);
      } catch {
        /* detail page surfaces login / retry */
      }
      return task;
    },
    onSuccess: (task) => {
      setShowCreate(false);
      setKeywordsText('');
      qc.invalidateQueries({ queryKey: ['prospecting'] });
      window.location.href = `/prospecting/${task.id}`;
    }
  });

  const keywords = keywordsText
    .split(/[,，\n]/)
    .map((k) => k.trim())
    .filter(Boolean);
  const plannedVideos = keywords.length * topNVideos;
  const allowedVideos = guard
    ? Math.min(plannedVideos, guard.videosRemaining)
    : plannedVideos;
  const estimatedMinutes = estimateProspectingMinutes(
    allowedVideos,
    guard?.limits
  );

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="关键词获客"
        description="设置主题关键词，爬取社交平台内容，分析并输出高相关潜客"
        actions={
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            + 新建任务
          </button>
        }
      />

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
                onChange={(e) =>
                  setPlatform(e.target.value as ProspectingPlatform)
                }
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
                htmlFor="prospecting-video-count"
                className="block text-xs text-muted-foreground mb-1"
              >
                爬取视频数
              </label>
              <input
                id="prospecting-video-count"
                type="number"
                min={1}
                max={10}
                value={topNVideos}
                onChange={(e) => setTopNVideos(Number(e.target.value))}
                className="w-full rounded border bg-background px-2 py-1.5 text-sm"
              />
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
              htmlFor="prospecting-keywords"
              className="block text-xs text-muted-foreground mb-1"
            >
              主题关键词（逗号或换行分隔）*
            </label>
            <textarea
              id="prospecting-keywords"
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              rows={3}
              placeholder="例如：企业版 SaaS, 采购经理, 数字化转型"
              className="w-full rounded border bg-background px-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            大批量靠「分天增量」而不是一次拉满。单任务最多 10 个视频、8
            个关键词；账号每天最多爬 {guard?.limits.dailyVideoLimit ?? 60}{' '}
            个视频、采集 {guard?.limits.dailyProfileLimit ?? 24} 次主页。
            {guard?.platformAccountName
              ? ` 当前账号「${guard.platformAccountName}」${guard.health ? ` · ${guard.health.label} ${guard.health.score}` : ''}。`
              : ''}
            今日剩余 {guard?.videosRemaining ?? '-'} 个视频额度
            {keywords.length > 0
              ? `，本次约 ${allowedVideos} 个视频 / ${estimatedMinutes} 分钟`
              : ''}
            {guard && plannedVideos > guard.videosRemaining && guard.videosRemaining > 0
              ? '（额度不足，将自动裁剪）'
              : ''}
            {guard && guard.captchaWaitMs > 0
              ? `，验证码冷却 ${Math.ceil(guard.captchaWaitMs / 60000)} 分钟`
              : ''}
            {guard?.needsLogin ? '。请先在「集成配置」完成抖音扫码登录' : ''}
            。近 {guard?.skipTtlDays ?? 7} 天已抓视频默认跳过。
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => keywords.length && createMutation.mutate()}
              disabled={!keywords.length || createMutation.isPending}
              className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {createMutation.isPending ? '创建中…' : '创建并开始执行'}
            </button>
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
                  <th className="text-left px-4 py-3 font-medium">关键词</th>
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
                        {(task.keywords as string[]).join('、')}
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
