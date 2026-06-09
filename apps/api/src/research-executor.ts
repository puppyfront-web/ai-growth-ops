import type { DatabaseClient, ContentOpportunity, ResearchInsight, ResearchTask } from '@ai-growth-ops/database';
import { decryptToken } from '@ai-growth-ops/providers';
import { DefaultSkillRunner } from '@ai-growth-ops/skills';
import { fetchWithTimeout } from './browser-login-config.js';

type TaskSnapshot = ResearchTask & {
  collectedPosts: Record<string, unknown>[];
  collectedComments: Record<string, unknown>[];
  insights: ResearchInsight[];
  opportunities: ContentOpportunity[];
};

export interface ResearchExecutionResult {
  task: TaskSnapshot;
  posts: TaskSnapshot['collectedPosts'];
  comments: TaskSnapshot['collectedComments'];
  insights: ResearchInsight[];
  opportunities: ContentOpportunity[];
}

export async function executeResearchTaskSync(
  db: DatabaseClient,
  researchTaskId: string,
  userId: string,
): Promise<ResearchExecutionResult> {
  const task = await db.researchTask.findFirst({
    where: { id: researchTaskId, userId, deletedAt: null },
  });
  if (!task) {
    throw new ResearchExecutionError(404, 'NOT_FOUND', 'Not found');
  }
  if (!['DRAFT', 'PAUSED', 'FAILED'].includes(task.status)) {
    throw new ResearchExecutionError(400, 'INVALID_STATE', `Cannot run from ${task.status} state`);
  }

  try {
    await db.researchTask.update({
      where: { id: task.id },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        finishedAt: null,
        lastError: null,
      },
    });

    await clearPreviousOutputs(db, task.id);

    const platform = Array.isArray(task.platforms) ? String(task.platforms[0] ?? 'douyin') : 'douyin';
    const keywords = Array.isArray(task.keywords) ? task.keywords.map((item) => String(item)) : [];

    // ── Phase 1: Collect real data via browser-runner ────────────────
    const account = await db.platformAccount.findFirst({
      where: {
        organizationId: task.organizationId ?? undefined,
        platform: platform as never,
        mode: 'browser_assist',
        status: 'active',
        deletedAt: null,
        cookieRef: { not: '' },
      },
    });
    if (!account) {
      throw new ResearchExecutionError(400, 'NO_ACCOUNT', `没有找到 ${platform} 平台的已登录账号，请先扫码登录`);
    }
    const cookie = decryptToken(account.cookieRef!);
    const runnerUrl = process.env.BROWSER_RUNNER_URL || 'http://localhost:3200';
    const RUNNER_SECRET = process.env.BROWSER_RUNNER_SECRET || process.env.TOKEN_ENCRYPTION_KEY || '';

    const allPosts: Array<Record<string, unknown>> = [];
    const allComments: Array<Record<string, unknown>> = [];

    for (const keyword of keywords.length > 0 ? keywords : ['热门内容']) {
      try {
        console.log(`[research] Searching "${keyword}" on ${platform}...`);
        const resp = await fetchWithTimeout(`${runnerUrl}/assist/search-and-fetch-comments`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(RUNNER_SECRET ? { authorization: `Bearer ${RUNNER_SECRET}` } : {}),
          },
          body: JSON.stringify({
            platform,
            cookie,
            keyword,
            topN: task.type === 'competitor_analysis' ? 5 : 3,
            headed: false,
            maxCommentsPerVideo: 20,
          }),
        }, 180_000);

        if (!resp.ok) {
          const errText = await resp.text();
          console.error(`[research] Search failed for "${keyword}": ${resp.status} ${errText}`);
          continue;
        }

        const searchResult = await resp.json() as Record<string, unknown>;
        const results = (searchResult.results ?? []) as Array<Record<string, unknown>>;

        for (const video of results) {
          allPosts.push({
            externalPostId: video.contentId ?? '',
            title: video.title ?? '',
            authorName: video.author ?? '',
            commentCount: (video.comments as Record<string, unknown>[])?.length ?? 0,
            metadata: { keyword },
          });
          for (const comment of (video.comments ?? []) as Array<Record<string, unknown>>) {
            allComments.push({
              ...comment,
              externalPostId: video.contentId ?? '',
            });
          }
        }
        console.log(`[research] Keyword "${keyword}": ${results.length} videos, ${allComments.length} total comments`);
      } catch (err) {
        console.error(`[research] Search error for "${keyword}":`, err instanceof Error ? err.message : String(err));
        continue;
      }
    }

    if (allPosts.length === 0 && allComments.length === 0) {
      throw new ResearchExecutionError(502, 'NO_DATA', '搜索未返回任何结果，请检查关键词或稍后重试');
    }

    // ── Phase 2: Store collected data ───────────────────────────────
    for (const post of allPosts) {
      await db.collectedPost.create({
        data: {
          researchTaskId: task.id,
          platform: platform as never,
          externalPostId: String(post.externalPostId),
          title: post.title as string | undefined,
          content: post.content as string | undefined,
          authorId: post.authorId as string | undefined,
          authorName: post.authorName as string | undefined,
          likeCount: post.likeCount as number | undefined,
          commentCount: post.commentCount as number | undefined,
          shareCount: post.shareCount as number | undefined,
          publishedAt: post.publishedAt ? new Date(post.publishedAt as string) : undefined,
          metadata: post.metadata as Record<string, unknown>,
        },
      });
    }

    for (const comment of allComments) {
      await db.collectedComment.create({
        data: {
          researchTaskId: task.id,
          platform: platform as never,
          externalCommentId: String(comment.externalCommentId ?? comment.id ?? ''),
          externalPostId: comment.externalPostId as string | undefined,
          externalUserId: comment.externalUserId as string | undefined,
          externalUserName: comment.externalUserName as string | undefined,
          content: String(comment.content ?? comment.text ?? ''),
          likeCount: comment.likeCount as number | undefined,
          metadata: comment.metadata as Record<string, unknown>,
        },
      });
    }

    console.log(`[research] Stored ${allPosts.length} posts, ${allComments.length} comments`);

    // ── Phase 3: Generate AI insights ───────────────────────────────
    await createInsightsAndOpportunities(db, {
      researchTaskId: task.id,
      platform,
      keywords,
      posts: allPosts.map(p => ({
        title: p.title as string | undefined,
        content: p.content as string | undefined,
        likeCount: p.likeCount as number | undefined,
        commentCount: p.commentCount as number | undefined,
      })),
      comments: allComments.map(c => ({
        content: String(c.content ?? c.text ?? ''),
        externalUserName: c.externalUserName as string | undefined,
        likeCount: c.likeCount as number | undefined,
      })),
    });

    await db.researchTask.update({
      where: { id: task.id },
      data: {
        status: 'INSIGHT_GENERATED',
        finishedAt: new Date(),
      },
    });

    console.log(`[research] Task ${researchTaskId} completed: INSIGHT_GENERATED`);

    const snapshot = await loadTaskSnapshot(db, task.id, userId);
    return {
      task: snapshot,
      posts: snapshot.collectedPosts,
      comments: snapshot.collectedComments,
      insights: snapshot.insights,
      opportunities: snapshot.opportunities,
    };
  } catch (error) {
    console.error(`[research] Task ${researchTaskId} failed:`, error instanceof Error ? error.message : String(error));
    await db.researchTask.update({
      where: { id: task.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        lastError: error instanceof Error ? error.message : String(error),
      },
    }).catch(() => { /* update may fail if record gone */ });
    throw error;
  }
}

async function loadTaskSnapshot(db: DatabaseClient, researchTaskId: string, userId: string): Promise<TaskSnapshot> {
  return db.researchTask.findFirstOrThrow({
    where: { id: researchTaskId, userId, deletedAt: null },
    include: {
      collectedPosts: { orderBy: { collectedAt: 'desc' } },
      collectedComments: { orderBy: { collectedAt: 'desc' } },
      insights: { orderBy: { createdAt: 'desc' } },
      opportunities: { orderBy: { createdAt: 'desc' } },
    },
  });
}

async function clearPreviousOutputs(db: DatabaseClient, researchTaskId: string): Promise<void> {
  await db.$transaction([
    db.researchInsight.deleteMany({ where: { researchTaskId } }),
    db.contentOpportunity.deleteMany({ where: { researchTaskId } }),
    db.collectedComment.deleteMany({ where: { researchTaskId } }),
    db.collectedPost.deleteMany({ where: { researchTaskId } }),
  ]);
}

// ── AI-powered insight generation (with rule-based fallback) ────────────

async function createInsightsAndOpportunities(
  db: DatabaseClient,
  input: {
    researchTaskId: string;
    platform: string;
    keywords: string[];
    posts: Array<{ title?: string; content?: string; likeCount?: number; commentCount?: number }>;
    comments: Array<{ content: string; externalUserName?: string; likeCount?: number }>;
  },
): Promise<void> {
  // Try AI insight generation first
  try {
    console.log('[research] Generating AI insights...');
    const runner = new DefaultSkillRunner();
    const result = await runner.run({
      skillName: 'research-insight',
      input: {
        posts: input.posts.slice(0, 20),
        comments: input.comments.slice(0, 50).map(c => ({ text: c.content, user: c.externalUserName })),
        keywords: input.keywords,
        platform: input.platform,
      },
    });

    if (result.status === 'success' && result.output) {
      const output = result.output as Record<string, unknown>;

      // Store AI-generated insights
      const insightDefs = [
        { type: 'pain_points', title: '用户痛点分析', data: output.painPoints },
        { type: 'popular_topics', title: '热门话题趋势', data: output.popularTopics },
        { type: 'content_angles', title: '内容创作角度', data: output.contentAngles },
      ];

      for (const def of insightDefs) {
        const items = Array.isArray(def.data) ? def.data : [def.data];
        if (!items.length) continue;
        await db.researchInsight.create({
          data: {
            researchTaskId: input.researchTaskId,
            type: def.type,
            title: def.title,
            summary: items.slice(0, 3).map(String).join('；'),
            data: def.data as Record<string, unknown>,
          },
        });
      }

      // Store AI-generated content opportunities
      const opportunities = (output.suggestedOpportunities ?? []) as Array<Record<string, unknown>>;
      for (const opp of opportunities.slice(0, 5)) {
        await db.contentOpportunity.create({
          data: {
            researchTaskId: input.researchTaskId,
            title: String(opp.title ?? ''),
            description: String(opp.evidence ?? opp.format ?? ''),
            platforms: [input.platform],
            priority: String(opp.priority ?? 'medium'),
          },
        });
      }
      console.log(`[research] AI insights generated: ${insightDefs.length} insights, ${opportunities.length} opportunities`);
      return;
    }
  } catch (err) {
    console.error('[research] AI insight generation failed, falling back to rule-based:', err instanceof Error ? err.message : String(err));
  }

  // Fallback: rule-based analysis
  await createInsightsAndOpportunitiesFallback(db, input);
}

async function createInsightsAndOpportunitiesFallback(
  db: DatabaseClient,
  input: {
    researchTaskId: string;
    platform: string;
    keywords: string[];
    posts: Array<{ title?: string; content?: string; likeCount?: number; commentCount?: number }>;
    comments: Array<{ content: string; externalUserName?: string; likeCount?: number }>;
  },
): Promise<void> {
  console.log('[research] Using rule-based insight fallback');
  const topThemes = analyzeContentThemes(input.posts);
  const totalLikes = input.posts.reduce((sum, post) => sum + (post.likeCount || 0), 0);
  const totalComments = input.comments.length;
  const sentiment = analyzeCommentSentiment(input.comments);

  const insights: Array<{ type: string; title: string; summary: string; data: unknown }> = [
    ...(topThemes.length > 0
      ? [{
          type: 'content_theme',
          title: '热门内容主题分析',
          summary: `基于${input.posts.length}篇内容，当前最受关注的主题是${topThemes[0].theme}。`,
          data: { themes: topThemes },
        }]
      : []),
    {
      type: 'engagement_pattern',
      title: '用户互动模式',
      summary: `共收集${input.posts.length}篇内容、${totalComments}条评论，总点赞数${totalLikes}。`,
      data: { totalPosts: input.posts.length, totalComments, totalLikes },
    },
    {
      type: 'comment_sentiment',
      title: '评论情感分析',
      summary: `正面评论${sentiment.positive}%，中性${sentiment.neutral}%，负面${sentiment.negative}%。`,
      data: sentiment,
    },
  ];

  for (const insight of insights) {
    await db.researchInsight.create({
      data: {
        researchTaskId: input.researchTaskId,
        type: insight.type,
        title: insight.title,
        summary: insight.summary,
        data: insight.data as Record<string, unknown>,
      },
    });
  }

  const opportunities = topThemes.slice(0, 3).map((theme) => ({
    title: `${theme.theme}内容方向`,
    description: `围绕${theme.theme}延展内容，当前平均互动约${theme.avgEngagement}。`,
    platforms: [input.platform],
    priority: theme.avgEngagement > 500 ? 'high' : theme.avgEngagement > 100 ? 'medium' : 'low',
  }));

  if (opportunities.length === 0) {
    opportunities.push({
      title: `${input.keywords[0] ?? '调研主题'}内容方向`,
      description: '基于本次调研结果生成的通用内容机会。',
      platforms: [input.platform],
      priority: 'medium',
    });
  }

  for (const opportunity of opportunities) {
    await db.contentOpportunity.create({
      data: {
        researchTaskId: input.researchTaskId,
        title: opportunity.title,
        description: opportunity.description,
        platforms: opportunity.platforms as never,
        priority: opportunity.priority,
      },
    });
  }
}

function analyzeContentThemes(posts: Array<{ title?: string; content?: string; likeCount?: number; commentCount?: number }>) {
  const themeMap = new Map<string, { count: number; totalEngagement: number }>();
  const keywords = ['AI', '获客', '营销', '自动化', '内容', '运营', '增长', '私域', '投放', '转化', '品牌', '直播', '短视频', '小红书', '抖音', '美白', '精华', '护肤', '种草'];

  for (const post of posts) {
    const text = `${post.title || ''} ${post.content || ''}`;
    const engagement = (post.likeCount || 0) + (post.commentCount || 0);
    for (const keyword of keywords) {
      if (!text.includes(keyword)) continue;
      const existing = themeMap.get(keyword) || { count: 0, totalEngagement: 0 };
      existing.count += 1;
      existing.totalEngagement += engagement;
      themeMap.set(keyword, existing);
    }
  }

  return Array.from(themeMap.entries())
    .map(([theme, stats]) => ({
      theme,
      count: stats.count,
      avgEngagement: Math.round(stats.totalEngagement / Math.max(stats.count, 1)),
    }))
    .sort((left, right) => right.avgEngagement - left.avgEngagement);
}

function analyzeCommentSentiment(comments: Array<{ content: string }>) {
  const positiveWords = ['好', '棒', '赞', '有用', '学到了', '不错', '收藏', '分享', '厉害', '推荐'];
  const negativeWords = ['差', '骗', '假', '差评', '失望', '垃圾', '坑', '不行', '退'];

  let positive = 0;
  let negative = 0;
  let neutral = 0;

  for (const comment of comments) {
    const hasPositive = positiveWords.some((word) => comment.content.includes(word));
    const hasNegative = negativeWords.some((word) => comment.content.includes(word));
    if (hasPositive && !hasNegative) positive += 1;
    else if (hasNegative && !hasPositive) negative += 1;
    else neutral += 1;
  }

  const total = Math.max(comments.length, 1);
  return {
    positive: Math.round((positive / total) * 100),
    neutral: Math.round((neutral / total) * 100),
    negative: Math.round((negative / total) * 100),
    topKeywords: ['价格咨询', '方案需求', '案例参考'],
  };
}

export class ResearchExecutionError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ResearchExecutionError';
  }
}
