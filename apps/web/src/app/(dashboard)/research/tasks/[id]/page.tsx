'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  createContentFromOpportunity,
  getResearchTask,
  runResearchTask
} from '@/lib/api/research';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { researchStatusLabels } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { useState } from 'react';

export default function ResearchTaskDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    'info' | 'posts' | 'comments' | 'insights'
  >('info');
  const [contentCreatedId, setContentCreatedId] = useState<string | null>(null);

  const { data: task, isLoading } = useQuery({
    queryKey: ['research-task', id],
    queryFn: () => getResearchTask(id)
  });
  const runMutation = useMutation({
    mutationFn: () => runResearchTask(id),
    onSuccess: () => {
      setActiveTab('insights');
      qc.invalidateQueries({ queryKey: ['research-task', id] });
      qc.invalidateQueries({ queryKey: ['research-tasks'] });
      qc.invalidateQueries({ queryKey: ['research-insights'] });
      qc.invalidateQueries({ queryKey: ['content-opportunities'] });
    }
  });
  const createContentMutation = useMutation({
    mutationFn: (opportunityId: string) =>
      createContentFromOpportunity(opportunityId),
    onSuccess: (result) => {
      setContentCreatedId(result.contentItemId);
      qc.invalidateQueries({ queryKey: ['content-items'] });
    }
  });

  if (isLoading) return <LoadingState />;
  if (!task) return null;

  const canRun = task.status === 'DRAFT' || task.status === 'FAILED';
  const posts = task.collectedPosts ?? [];
  const comments = task.collectedComments ?? [];
  const insights = task.insights ?? [];
  const opportunities = task.opportunities ?? [];

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title={
          task.type === 'keyword_search'
            ? '关键词搜索任务'
            : task.type === 'competitor_analysis'
              ? '竞品分析任务'
              : '评论采样任务'
        }
        description={`状态: ${researchStatusLabels[task.status]}`}
        actions={
          canRun ? (
            <button
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {runMutation.isPending ? '运行中...' : '运行任务'}
            </button>
          ) : undefined
        }
      />

      <div className="flex gap-2 border-b mb-6">
        {[
          { key: 'info' as const, label: '任务信息' },
          { key: 'posts' as const, label: '采集内容' },
          { key: 'comments' as const, label: '采集评论' },
          { key: 'insights' as const, label: 'AI 洞察' }
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'info' && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-muted-foreground">平台</span>
              <div className="font-medium">
                {Array.isArray(task.platforms)
                  ? task.platforms.join(', ')
                  : '-'}
              </div>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">状态</span>
              <div>
                <StatusBadge
                  status={task.status}
                  label={researchStatusLabels[task.status]}
                />
              </div>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">关键词</span>
              <div className="font-medium">
                {Array.isArray(task.keywords)
                  ? task.keywords.join(', ') || '-'
                  : '-'}
              </div>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">最近运行</span>
              <div className="font-medium">
                {task.startedAt ? formatDate(task.startedAt) : '未运行'}
              </div>
            </div>
          </div>
          {task.lastError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700">
              失败原因: {task.lastError}
            </div>
          )}
        </div>
      )}

      {activeTab === 'posts' && posts && (
        <div className="space-y-3">
          {posts.length === 0 && (
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              运行任务后会在这里展示采集内容。
            </div>
          )}
          {posts.map((post) => (
            <div key={post.id} className="rounded-xl border bg-card p-4">
              <h4 className="font-medium">{post.title}</h4>
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                {post.content}
              </p>
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span>作者: {post.authorName}</span>
                <span>点赞: {post.likeCount}</span>
                <span>评论: {post.commentCount}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'comments' && comments && (
        <div className="space-y-2">
          {comments.length === 0 && (
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              运行任务后会在这里展示采集评论。
            </div>
          )}
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-lg border bg-card p-3">
              <p className="text-sm">{comment.content}</p>
              <span className="text-xs text-muted-foreground">
                点赞: {comment.likeCount}
              </span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'insights' && (
        <div className="space-y-6">
          {contentCreatedId && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 p-4 text-sm text-emerald-700">
              已生成内容。
              <Link href="/content" className="ml-2 font-medium underline">
                前往内容列表查看
              </Link>
            </div>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">AI 洞察</h3>
              <Link
                href="/research/insights"
                className="text-sm text-blue-600 hover:underline"
              >
                查看全局洞察
              </Link>
            </div>
            {insights.length === 0 ? (
              <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                运行任务后将自动生成洞察。
              </div>
            ) : (
              insights.map((insight) => (
                <div key={insight.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-3">
                    <StatusBadge status="info" label={insight.type} />
                    <h4 className="font-medium">{insight.title}</h4>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {insight.summary}
                  </p>
                </div>
              ))
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">选题机会</h3>
              <Link
                href="/research/opportunities"
                className="text-sm text-blue-600 hover:underline"
              >
                查看全部机会
              </Link>
            </div>
            {opportunities.length === 0 ? (
              <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                生成洞察后会在这里沉淀选题机会。
              </div>
            ) : (
              opportunities.map((opportunity) => (
                <div
                  key={opportunity.id}
                  className="rounded-xl border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-medium">{opportunity.title}</h4>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {opportunity.description}
                      </p>
                      {opportunity.priority && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          优先级：{opportunity.priority}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() =>
                        createContentMutation.mutate(opportunity.id)
                      }
                      disabled={createContentMutation.isPending}
                      className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
                    >
                      {createContentMutation.isPending
                        ? '生成中...'
                        : '生成内容'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}
