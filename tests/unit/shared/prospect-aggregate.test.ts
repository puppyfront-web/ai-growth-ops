import { describe, it, expect } from 'vitest';
import {
  aggregateProspectComments,
  mergeProspectEvidence,
  prioritizeProspectEvidence
} from '../../../packages/shared/src/prospect-aggregate';
import { scoreProspectUser } from '../../../packages/shared/src/prospect-scoring';

const videos = [
  {
    contentId: 'v1',
    title: '企业获客工具测评',
    author: '增长小王',
    url: 'https://www.douyin.com/video/v1',
    comments: [
      {
        externalUserId: 'user-a',
        userNickname: '采购老张',
        userHomepage: 'https://www.douyin.com/user/user-a',
        avatarUrl: 'https://img/a.jpg',
        content: '这个多少钱？我们公司想采购',
        likeCount: 12,
        publishedAt: '2 天前'
      },
      {
        externalUserId: 'user-b',
        userNickname: '路人乙',
        content: '哈',
        likeCount: 0
      }
    ]
  },
  {
    contentId: 'v2',
    title: '获客方案拆解',
    author: '增长小王',
    url: 'https://www.douyin.com/video/v2',
    comments: [
      {
        externalUserId: 'user-a',
        userNickname: '采购老张',
        content: '能发个报价单吗',
        likeCount: 3
      },
      {
        externalUserId: 'user-a',
        userNickname: '采购老张',
        content: '能发个报价单吗',
        likeCount: 3
      }
    ]
  }
];

describe('aggregateProspectComments', () => {
  it('groups comments of the same user across videos', () => {
    const result = aggregateProspectComments(videos, '企业获客');
    const zhang = result.find((p) => p.externalUserId === 'user-a');

    expect(zhang).toBeDefined();
    expect(zhang!.evidence).toHaveLength(2);
    expect(zhang!.evidence[0].sourceVideoTitle).toBe('企业获客工具测评');
    expect(zhang!.evidence[1].sourceVideoUrl).toBe(
      'https://www.douyin.com/video/v2'
    );
  });

  it('keeps profile fields discovered on any comment', () => {
    const [zhang] = aggregateProspectComments(videos, '企业获客');

    expect(zhang.userHomepage).toBe('https://www.douyin.com/user/user-a');
    expect(zhang.avatarUrl).toBe('https://img/a.jpg');
    expect(zhang.keyword).toBe('企业获客');
  });

  it('drops too-short comments and users without identity', () => {
    const result = aggregateProspectComments(
      [
        {
          contentId: 'v3',
          comments: [
            { userNickname: '', content: '我要买' },
            { userNickname: '有效用户', content: '想了解一下方案报价' }
          ]
        }
      ],
      '方案'
    );

    expect(result).toHaveLength(1);
    expect(result[0].userNickname).toBe('有效用户');
  });

  it('uses nickname as the dedupe key when the platform hides user ids', () => {
    const result = aggregateProspectComments(
      [
        {
          contentId: 'v4',
          comments: [
            { userNickname: '同名用户', content: '第一条评论内容' },
            { userNickname: '同名用户', content: '第二条评论内容' }
          ]
        }
      ],
      '方案'
    );

    expect(result).toHaveLength(1);
    expect(result[0].userKey).toBe('同名用户');
    expect(result[0].evidence).toHaveLength(2);
  });
});

describe('mergeProspectEvidence', () => {
  it('appends new comments and skips duplicates', () => {
    const existing = [
      {
        content: '这个多少钱？',
        sourceVideoTitle: '测评',
        sourceVideoUrl: 'https://v/1',
        publishedAt: null,
        likeCount: 2
      }
    ];
    const incoming = [
      {
        content: '这个多少钱？',
        sourceVideoTitle: '测评',
        sourceVideoUrl: 'https://v/1',
        publishedAt: null,
        likeCount: 2
      },
      {
        content: '能发个方案吗',
        sourceVideoTitle: '拆解',
        sourceVideoUrl: 'https://v/2',
        publishedAt: null,
        likeCount: 5
      }
    ];

    const merged = mergeProspectEvidence(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged[1].content).toBe('能发个方案吗');
  });
});

describe('prioritizeProspectEvidence', () => {
  it('keeps all comments and puts the preferred one first', () => {
    const ranked = prioritizeProspectEvidence(
      [
        {
          content: '路过',
          sourceVideoTitle: null,
          sourceVideoUrl: null,
          publishedAt: null,
          likeCount: 9
        },
        {
          content: '想采购',
          sourceVideoTitle: null,
          sourceVideoUrl: null,
          publishedAt: null,
          likeCount: 1
        }
      ],
      '想采购'
    );

    expect(ranked).toHaveLength(2);
    expect(ranked[0].content).toBe('想采购');
    expect(ranked[1].content).toBe('路过');
  });
});

describe('demand-post author aggregation (需求帖作者)', () => {
  it('aggregates the author of a demand-titled video as a prospect', () => {
    const [author] = aggregateProspectComments(
      [
        {
          contentId: 'v1',
          title: '工厂想上AI改造，求推荐靠谱的服务商',
          author: '老王厂长',
          url: 'https://douyin.com/video/v1',
          comments: []
        }
      ],
      'AI工厂改造'
    );
    expect(author).toBeDefined();
    expect(author.userKey).toBe('author:老王厂长');
    expect(author.userNickname).toBe('老王厂长');
    expect(author.evidence[0]?.content).toContain('（需求帖）');

    const score = scoreProspectUser({
      contents: author.evidence.map((item) => item.content),
      keywords: ['AI改造'],
      icpHighIntentKeywords: ['合作'],
      videoTitle: author.sourceVideoTitle ?? undefined
    });
    expect(['A', 'B']).toContain(score.leadLevel);
    expect(score.relevanceScore).toBeGreaterThanOrEqual(40);
  });

  it('ignores authors of promotional or informational videos', () => {
    const prospects = aggregateProspectComments(
      [
        {
          contentId: 'v2',
          title: '工信部发令，2万家软件企业AI改造',
          author: 'AI资讯号',
          url: 'https://douyin.com/video/v2',
          comments: [{ externalUserId: 'u1', content: '这个方向怎么看？' }]
        }
      ],
      'AI工厂改造'
    );
    expect(prospects.map((p) => p.userKey)).toEqual(['u1']);
  });
});

describe('DOM noise filtering (抓取噪音)', () => {
  it('drops relative-timestamp residue like "5天前·广东"', () => {
    const prospects = aggregateProspectComments(
      [
        {
          contentId: 'v9',
          title: 'AI工厂改造',
          author: '作者',
          url: 'u',
          comments: [
            { externalUserId: 'u9', content: '5天前·广东' },
            { externalUserId: 'u9', content: '3小时前' },
            { externalUserId: 'u9', content: '我们厂想做AI改造，怎么联系？' }
          ]
        }
      ],
      'AI工厂改造'
    );
    const evidences = prospects[0]?.evidence ?? [];
    expect(evidences).toHaveLength(1);
    expect(evidences[0]?.content).toContain('怎么联系');
  });
});
