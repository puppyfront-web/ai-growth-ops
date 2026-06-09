import { describe, it, expect } from 'vitest';

interface CollectedPost {
  externalPostId: string;
  title: string;
  content: string;
  likeCount: number;
}

interface CollectedComment {
  externalCommentId: string;
  content: string;
  likeCount: number;
}

interface SearchPostsInput {
  keywords: string[];
  maxPosts: number;
}

interface CollectCommentsInput {
  externalPostId: string;
  maxComments: number;
}

interface ResearchProvider {
  readonly name: string;
  searchPosts(input: SearchPostsInput): Promise<CollectedPost[]>;
  collectPostComments(input: CollectCommentsInput): Promise<CollectedComment[]>;
}

class SandboxResearchProvider implements ResearchProvider {
  readonly name = 'sandbox_research';
  private requestCount = 0;
  private maxRpm = 10;

  async searchPosts(input: SearchPostsInput): Promise<CollectedPost[]> {
    this.requestCount++;
    if (this.requestCount > this.maxRpm) throw new Error('Rate limit exceeded');

    const count = Math.min(input.maxPosts, 5);
    return Array.from({ length: count }, (_, i) => ({
      externalPostId: `post_${i}`,
      title: `热门内容 ${input.keywords[0]} #${i}`,
      content: `关于${input.keywords.join('、')}的讨论内容...`,
      likeCount: 100 + i * 10
    }));
  }

  async collectPostComments(
    input: CollectCommentsInput
  ): Promise<CollectedComment[]> {
    const count = Math.min(input.maxComments, 3);
    return Array.from({ length: count }, (_, i) => ({
      externalCommentId: `comment_${input.externalPostId}_${i}`,
      content: `评论内容 ${i}`,
      likeCount: i
    }));
  }
}

describe('ResearchProvider Contract', () => {
  const provider = new SandboxResearchProvider();

  it('searchPosts respects maxPosts', async () => {
    const posts = await provider.searchPosts({ keywords: ['AI'], maxPosts: 3 });
    expect(posts.length).toBe(3);
  });

  it('searchPosts returns correct structure', async () => {
    const posts = await provider.searchPosts({ keywords: ['AI'], maxPosts: 1 });
    expect(posts[0].externalPostId).toBeDefined();
    expect(posts[0].title).toBeDefined();
    expect(posts[0].content).toBeDefined();
  });

  it('collectPostComments respects maxComments', async () => {
    const comments = await provider.collectPostComments({
      externalPostId: 'p1',
      maxComments: 2
    });
    expect(comments.length).toBe(2);
  });

  it('rate limiting is enforced', async () => {
    const limited = new (class extends SandboxResearchProvider {
      private cnt = 0;
      override async searchPosts(input: SearchPostsInput) {
        this.cnt++;
        if (this.cnt > 2) throw new Error('Rate limit exceeded');
        return super.searchPosts(input);
      }
    })();

    await limited.searchPosts({ keywords: ['test'], maxPosts: 1 });
    await limited.searchPosts({ keywords: ['test'], maxPosts: 1 });
    await expect(
      limited.searchPosts({ keywords: ['test'], maxPosts: 1 })
    ).rejects.toThrow('Rate limit exceeded');
  });
});
