import type { DatabaseClient, ContentOpportunity, ResearchInsight, ResearchTask } from '@ai-growth-ops/database';

type TaskSnapshot = ResearchTask & {
  collectedPosts: any[];
  collectedComments: any[];
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

    const platform = Array.isArray(task.platforms) ? String(task.platforms[0] ?? 'xiaohongshu') : 'xiaohongshu';
    const keywords = Array.isArray(task.keywords) ? task.keywords.map((item) => String(item)) : [];

    // Call research-runner service (browser-assist mode) for real data collection
    const runnerUrl = process.env.RESEARCH_RUNNER_URL || 'http://localhost:3300';
    const resp = await fetch(`${runnerUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        researchTaskId: task.id,
        provider: 'browser_assist',
        platform,
        taskType: task.type,
        keywords,
        maxPosts: 8,
        maxComments: 3,
      }),
    });

    if (!resp.ok) {
      throw new Error(`Research runner returned ${resp.status}: ${await resp.text()}`);
    }

    const runnerResult = await resp.json() as Record<string, unknown>;
    const posts = (runnerResult.posts || []) as Array<Record<string, unknown>>;
    const comments = (runnerResult.comments || []) as Array<Record<string, unknown>>;

    for (const post of posts) {
      await db.collectedPost.create({
        data: {
          researchTaskId: task.id,
          platform: platform as any,
          externalPostId: String(post.externalPostId),
          title: post.title as string | undefined,
          content: post.content as string | undefined,
          authorId: post.authorId as string | undefined,
          authorName: post.authorName as string | undefined,
          likeCount: post.likeCount as number | undefined,
          commentCount: post.commentCount as number | undefined,
          shareCount: post.shareCount as number | undefined,
          publishedAt: post.publishedAt ? new Date(post.publishedAt as string) : undefined,
          metadata: post.metadata as any,
        },
      });
    }

    for (const comment of comments) {
      await db.collectedComment.create({
        data: {
          researchTaskId: task.id,
          platform: platform as any,
          externalCommentId: String(comment.externalCommentId),
          externalPostId: comment.externalPostId as string | undefined,
          externalUserId: comment.externalUserId as string | undefined,
          externalUserName: comment.externalUserName as string | undefined,
          content: String(comment.content),
          likeCount: comment.likeCount as number | undefined,
          metadata: comment.metadata as any,
        },
      });
    }

    await createInsightsAndOpportunities(db, {
      researchTaskId: task.id,
      platform,
      keywords,
      posts: posts.map(p => ({
        title: p.title as string | undefined,
        content: p.content as string | undefined,
        likeCount: p.likeCount as number | undefined,
        commentCount: p.commentCount as number | undefined,
      })),
      comments: comments.map(c => ({
        content: String(c.content),
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

    const snapshot = await loadTaskSnapshot(db, task.id, userId);
    return {
      task: snapshot,
      posts: snapshot.collectedPosts,
      comments: snapshot.collectedComments,
      insights: snapshot.insights,
      opportunities: snapshot.opportunities,
    };
  } catch (error) {
    await db.researchTask.update({
      where: { id: task.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        lastError: error instanceof Error ? error.message : String(error),
      },
    }).catch(() => {});
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

async function createInsightsAndOpportunities(
  db: DatabaseClient,
  input: {
    researchTaskId: string;
    platform: string;
    keywords: string[];
    posts: Array<{
      title?: string;
      content?: string;
      authorName?: string;
      likeCount?: number;
      commentCount?: number;
    }>;
    comments: Array<{
      content: string;
      externalUserName?: string;
      likeCount?: number;
    }>;
  },
): Promise<void> {
  const topThemes = analyzeContentThemes(input.posts);
  const totalLikes = input.posts.reduce((sum, post) => sum + (post.likeCount || 0), 0);
  const totalComments = input.comments.length;
  const sentiment = analyzeCommentSentiment(input.comments);

  const insights = [
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
      data: {
        totalPosts: input.posts.length,
        totalComments,
        totalLikes,
      },
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
        data: insight.data as any,
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
        platforms: opportunity.platforms as any,
        priority: opportunity.priority,
      },
    });
  }
}

function analyzeContentThemes(posts: Array<{ title?: string; content?: string; likeCount?: number; commentCount?: number }>) {
  const themeMap = new Map<string, { count: number; totalEngagement: number }>();
  const keywords = ['AI', '获客', '营销', '自动化', '内容', '运营', '增长', '私域', '投放', '转化', '品牌', '直播', '短视频', '小红书', '抖音'];

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
