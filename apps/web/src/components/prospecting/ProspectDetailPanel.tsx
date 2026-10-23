'use client';

import { Button } from '@/components/ui/button';
import type { ProspectCandidate } from '@/lib/api/prospecting';
import {
  candidateComments,
  ConvertedBadge,
  ProfileSummary,
  prospectLevelLabels
} from './prospect-shared';

type ProspectDetailPanelProps = {
  candidate: ProspectCandidate;
  strategies: Array<{ id: string; title: string }>;
  enrichBusy: boolean;
  onEnrich: (candidateId: string) => void;
  onConvert: (candidate: ProspectCandidate) => void;
};

/** 双栏布局右侧的详情面板：全量评论与操作，面板自身滚动。 */
export function ProspectDetailPanel({
  candidate: c,
  strategies,
  enrichBusy,
  onEnrich,
  onConvert
}: ProspectDetailPanelProps) {
  const comments = candidateComments(c);
  const attributionText =
    c.attributions
      ?.map((item) => strategies.find((s) => s.id === item.strategyId)?.title)
      .filter(Boolean)
      .join('、') || '历史任务';

  return (
    <div className="rounded-lg border">
      <div className="flex gap-3 border-b p-4 items-start">
        <Button
          type="button"
          size="icon"
          aria-label="采集主页资料"
          title={
            c.userHomepage ? '点击采集主页资料' : '暂无主页链接，无法采集'
          }
          disabled={!c.userHomepage || enrichBusy}
          onClick={() => onEnrich(c.id)}
          className="flex-shrink-0 rounded-full"
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
              {enrichBusy ? '…' : '采集'}
            </span>
          )}
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{c.userNickname ?? '未知用户'}</span>
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
                  ? 'bg-success/10 text-success'
                  : c.leadLevel === 'B'
                    ? 'bg-info/10 text-info'
                    : c.leadLevel === 'C'
                      ? 'bg-warning/10 text-warning'
                      : 'bg-muted text-muted-foreground'
              }`}
            >
              {prospectLevelLabels[c.leadLevel] ?? c.leadLevel}
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
          {c.metadata?.profile && <ProfileSummary profile={c.metadata.profile} />}
          {(enrichBusy || c.metadata?.enrichStatus === 'failed') && (
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
        </div>
        <div className="flex-shrink-0">
          {c.customerId ? (
            <ConvertedBadge customerId={c.customerId} />
          ) : (
            <Button variant="outline" size="xs" onClick={() => onConvert(c)}>
              转客户
            </Button>
          )}
        </div>
      </div>
      <div className="divide-y">
        {comments.map((item, index) => (
          <div key={`${item.content}-${index}`} className="px-4 py-2 text-sm">
            <div className="flex items-center gap-2 mb-0.5">
              {index === 0 && (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                  优先跟进
                </span>
              )}
              {item.likeCount != null && item.likeCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {item.likeCount} 赞
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap">{item.content}</p>
            <p className="text-xs mt-0.5 text-muted-foreground">
              命中策略：{attributionText}
              {item.sourceVideoTitle ? ` · 来源：${item.sourceVideoTitle}` : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
