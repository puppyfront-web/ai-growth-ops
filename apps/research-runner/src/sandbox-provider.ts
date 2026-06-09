import type {
  ResearchProvider,
  CollectPostsInput,
  CollectCommentsInput,
  CollectedPostData,
  CollectedCommentData
} from './types.js';
import { randomUUID } from 'crypto';

export class SandboxResearchProvider implements ResearchProvider {
  readonly name = 'sandbox';

  async collectPosts(input: CollectPostsInput): Promise<CollectedPostData[]> {
    const count = Math.min(input.maxPosts || 10, 20);
    const posts: CollectedPostData[] = [];
    for (let i = 0; i < count; i++) {
      posts.push({
        externalPostId: `sandbox_post_${randomUUID().slice(0, 8)}`,
        title: this.getMockPostTitle(i, input.keywords),
        content: this.getMockPostContent(i),
        authorId: `sandbox_author_${i}`,
        authorName: `测试作者${i + 1}`,
        likeCount: Math.floor(Math.random() * 5000),
        commentCount: Math.floor(Math.random() * 200),
        shareCount: Math.floor(Math.random() * 100),
        publishedAt: new Date(Date.now() - i * 86400000).toISOString()
      });
    }
    return posts;
  }

  async collectComments(
    input: CollectCommentsInput
  ): Promise<CollectedCommentData[]> {
    const comments: CollectedCommentData[] = [];
    const maxPerPost = input.maxCommentsPerPost || 5;
    for (const postId of input.postIds) {
      const count = Math.floor(Math.random() * maxPerPost) + 1;
      for (let i = 0; i < count; i++) {
        comments.push({
          externalCommentId: `sandbox_comment_${randomUUID().slice(0, 8)}`,
          externalPostId: postId,
          externalUserId: `sandbox_user_${i}`,
          externalUserName: `评论用户${i + 1}`,
          content: this.getMockComment(i),
          likeCount: Math.floor(Math.random() * 50)
        });
      }
    }
    return comments;
  }

  private getMockPostTitle(index: number, keywords?: string[]): string {
    const kw = keywords?.[0] || 'AI';
    const templates = [
      `${kw}如何改变企业获客方式`,
      `2024年${kw}行业趋势分析`,
      `${kw}获客最佳实践分享`,
      `使用${kw}提升营销效果的方法`,
      `${kw}在内容营销中的应用案例`,
      `从零开始搭建${kw}获客体系`,
      `${kw}自动化运营经验总结`,
      `中小企业如何利用${kw}获客`,
      `${kw}内容创作策略详解`,
      `${kw}用户增长实战心得`
    ];
    return templates[index % templates.length];
  }

  private getMockPostContent(index: number): string {
    const templates = [
      '这篇文章详细分析了如何利用AI技术帮助企业实现更高效的获客...',
      '我们调研了50家企业，总结了以下AI获客的最佳实践...',
      '通过实际案例分享我们如何使用AI工具提升营销ROI...',
      '从数据分析到内容生成，AI正在重塑营销获客的每个环节...',
      '本文将从工具选型、流程优化、效果衡量三个维度展开讨论...'
    ];
    return templates[index % templates.length];
  }

  private getMockComment(index: number): string {
    const templates = [
      '写得很好，学习了',
      '这个方案我们公司也在用，效果不错',
      '请问有没有更详细的案例分享？',
      '收费吗？想了解一下',
      '这种获客方式ROI怎么样？'
    ];
    return templates[index % templates.length];
  }
}
