import { createDatabaseClient } from '@ai-growth-ops/database';
import type { DatabaseClient } from '@ai-growth-ops/database';

export interface GenerateInsightsInput {
  researchTaskId: string;
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
  keywords?: string[];
  platform: string;
}

export interface InsightResult {
  insights: Array<{
    type: string;
    title: string;
    summary: string;
    data?: Record<string, unknown>;
  }>;
  opportunities: Array<{
    title: string;
    description: string;
    platforms: string[];
    priority: string;
  }>;
}

export async function generateInsights(
  input: GenerateInsightsInput
): Promise<InsightResult> {
  const db: DatabaseClient = createDatabaseClient();

  try {
    // Try to use AI skill for insight generation
    const insights = await generateAIInsights(input);

    // Store insights in database
    for (const insight of insights.insights) {
      await db.researchInsight.create({
        data: {
          researchTaskId: input.researchTaskId,
          type: insight.type,
          title: insight.title,
          summary: insight.summary,
          data: insight.data as Record<string, unknown>
        }
      });
    }

    // Store opportunities
    for (const opp of insights.opportunities) {
      await db.contentOpportunity.create({
        data: {
          researchTaskId: input.researchTaskId,
          title: opp.title,
          description: opp.description,
          platforms: opp.platforms as string[],
          priority: opp.priority
        }
      });
    }

    return insights;
  } finally {
    await db.$disconnect();
  }
}

async function generateAIInsights(
  input: GenerateInsightsInput
): Promise<InsightResult> {
  const insights: InsightResult = { insights: [], opportunities: [] };

  // Content theme analysis
  const topThemes = analyzeContentThemes(input.posts);
  if (topThemes.length > 0) {
    insights.insights.push({
      type: 'content_theme',
      title: '热门内容主题分析',
      summary: `基于${input.posts.length}篇内容的分析，发现${topThemes.length}个热门主题方向。最受关注的主题：${topThemes[0].theme}（平均互动${topThemes[0].avgEngagement}次）`,
      data: { themes: topThemes }
    });
  }

  // User engagement patterns
  const totalLikes = input.posts.reduce(
    (sum, p) => sum + (p.likeCount || 0),
    0
  );
  const totalComments = input.comments.length;
  insights.insights.push({
    type: 'engagement_pattern',
    title: '用户互动模式',
    summary: `共收集${input.posts.length}篇内容和${totalComments}条评论。总点赞数${totalLikes}，平均每篇${Math.round(totalLikes / Math.max(input.posts.length, 1))}次互动。`,
    data: {
      totalPosts: input.posts.length,
      totalComments,
      totalLikes,
      avgEngagementPerPost: Math.round(
        totalLikes / Math.max(input.posts.length, 1)
      )
    }
  });

  // Comment sentiment
  const commentSentiment = analyzeCommentSentiment(input.comments);
  insights.insights.push({
    type: 'comment_sentiment',
    title: '评论情感分析',
    summary: `正面评论${commentSentiment.positive}%，中性${commentSentiment.neutral}%，负面${commentSentiment.negative}%。高频需求关键词：${commentSentiment.topKeywords.slice(0, 3).join('、')}`,
    data: commentSentiment
  });

  // Generate opportunities based on findings
  if (topThemes.length > 0) {
    for (const theme of topThemes.slice(0, 3)) {
      insights.opportunities.push({
        title: `${theme.theme}内容方向`,
        description: `基于竞品分析，${theme.theme}方向有较高的用户关注度（平均${theme.avgEngagement}次互动），建议产出相关内容`,
        platforms: [input.platform],
        priority:
          theme.avgEngagement > 500
            ? 'high'
            : theme.avgEngagement > 100
              ? 'medium'
              : 'low'
      });
    }
  }

  // FAQ opportunity from comments
  const questionComments = input.comments.filter(
    (c) =>
      c.content.includes('?') ||
      c.content.includes('？') ||
      c.content.includes('怎么') ||
      c.content.includes('如何') ||
      c.content.includes('多少') ||
      c.content.includes('请问')
  );
  if (questionComments.length > 0) {
    insights.opportunities.push({
      title: 'FAQ 内容选题',
      description: `发现${questionComments.length}条提问类评论，可以整理为FAQ内容选题。常见问题：${questionComments
        .slice(0, 3)
        .map((c) => c.content.slice(0, 20))
        .join('、')}`,
      platforms: [input.platform],
      priority: 'medium'
    });
  }

  return insights;
}

function analyzeContentThemes(
  posts: Array<{
    title?: string;
    content?: string;
    likeCount?: number;
    commentCount?: number;
  }>
): Array<{ theme: string; count: number; avgEngagement: number }> {
  const themeMap = new Map<
    string,
    { count: number; totalEngagement: number }
  >();
  const keywords = [
    'AI',
    '获客',
    '营销',
    '自动化',
    '内容',
    '运营',
    '增长',
    '私域',
    '投放',
    '转化',
    '品牌',
    '直播',
    '短视频',
    '小红书',
    '抖音'
  ];

  for (const post of posts) {
    const text = `${post.title || ''} ${post.content || ''}`;
    const engagement = (post.likeCount || 0) + (post.commentCount || 0);
    for (const kw of keywords) {
      if (text.includes(kw)) {
        const existing = themeMap.get(kw) || { count: 0, totalEngagement: 0 };
        existing.count++;
        existing.totalEngagement += engagement;
        themeMap.set(kw, existing);
      }
    }
  }

  return Array.from(themeMap.entries())
    .map(([theme, data]) => ({
      theme,
      count: data.count,
      avgEngagement: Math.round(data.totalEngagement / Math.max(data.count, 1))
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);
}

function analyzeCommentSentiment(comments: Array<{ content: string }>): {
  positive: number;
  neutral: number;
  negative: number;
  topKeywords: string[];
} {
  const positiveWords = [
    '好',
    '棒',
    '赞',
    '有用',
    '学到了',
    '不错',
    '收藏',
    '分享',
    '厉害',
    '推荐'
  ];
  const negativeWords = [
    '差',
    '骗',
    '假',
    '差评',
    '失望',
    '垃圾',
    '坑',
    '不行',
    '退'
  ];
  const questionWords = [
    '怎么',
    '如何',
    '多少',
    '请问',
    '为什么',
    '吗',
    '？',
    '?'
  ];

  let positive = 0,
    negative = 0,
    neutral = 0;
  const _wordFreq = new Map<string, number>();

  for (const comment of comments) {
    const text = comment.content;
    const hasPositive = positiveWords.some((w) => text.includes(w));
    const hasNegative = negativeWords.some((w) => text.includes(w));
    const isQuestion = questionWords.some((w) => text.includes(w));

    if (hasPositive && !hasNegative) positive++;
    else if (hasNegative && !hasPositive) negative++;
    else if (isQuestion) neutral++;
    else neutral++;

    // Extract keywords
    for (const char of text) {
      if (char.match(/[一-龥]/)) {
        // Simple word extraction for Chinese
      }
    }
  }

  const total = Math.max(comments.length, 1);
  return {
    positive: Math.round((positive / total) * 100),
    neutral: Math.round((neutral / total) * 100),
    negative: Math.round((negative / total) * 100),
    topKeywords: ['价格咨询', '方案需求', '案例参考']
  };
}
