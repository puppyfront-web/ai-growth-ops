import { describe, expect, it } from 'vitest';
import {
  aggregateProspectComments,
  secUidFromHomepage
} from '@ai-growth-ops/shared';

describe('secUidFromHomepage', () => {
  it('提取 secUid 形态的最后路径段', () => {
    expect(
      secUidFromHomepage('https://www.douyin.com/user/MS4wLjABAAAAabc123')
    ).toBe('MS4wLjABAAAAabc123');
  });

  it('忽略查询串与多余路径', () => {
    expect(
      secUidFromHomepage(
        'https://www.douyin.com/user/MS4wLjABAAAAxyz?mod=aweme_detail'
      )
    ).toBe('MS4wLjABAAAAxyz');
  });

  it('纯数字段返回 null（数字 UID 主页不作跨链路标识）', () => {
    expect(secUidFromHomepage('https://www.douyin.com/user/107716741825')).toBeNull();
  });

  it('空值与无法解析的形态返回 null', () => {
    expect(secUidFromHomepage('')).toBeNull();
    expect(secUidFromHomepage(null)).toBeNull();
    expect(secUidFromHomepage(undefined)).toBeNull();
    expect(secUidFromHomepage('https://www.douyin.com/user/')).toBeNull();
    expect(secUidFromHomepage('not a url')).toBeNull();
  });
});

describe('aggregateProspectComments 同账号双链路合并', () => {
  const SEC_UID = 'MS4wLjABAAAAtest123';
  const homepage = `https://www.douyin.com/user/${SEC_UID}`;

  it('结构化（数字 UID + secUid 主页）与 DOM（secUid ID）评论合并为一条', () => {
    const prospects = aggregateProspectComments(
      [
        {
          contentId: 'v1',
          title: '宿舍风扇怎么选',
          url: 'https://www.douyin.com/video/v1',
          comments: [
            {
              // 结构化链路：externalUserId 为数字 UID，主页携带 secUid
              externalUserId: '107716741825',
              userNickname: '吃多多',
              userHomepage: homepage,
              content: '求推荐安静的宿舍风扇',
              likeCount: 3
            },
            {
              // DOM 兜底链路：externalUserId 只能取到 secUid
              externalUserId: SEC_UID,
              userNickname: '吃多多',
              userHomepage: homepage,
              content: '预算两百以内有吗',
              likeCount: 1
            }
          ]
        }
      ],
      '宿舍风扇'
    );

    expect(prospects).toHaveLength(1);
    expect(prospects[0].userKey).toBe(SEC_UID);
    expect(prospects[0].evidence).toHaveLength(2);
    expect(prospects[0].evidence.map((e) => e.content)).toEqual(
      expect.arrayContaining(['求推荐安静的宿舍风扇', '预算两百以内有吗'])
    );
  });

  it('同一账号相同内容跨链路不重复计入 evidence', () => {
    const content = '这家风扇噪音怎么样';
    const prospects = aggregateProspectComments(
      [
        {
          contentId: 'v1',
          title: '风扇测评',
          comments: [
            {
              externalUserId: '107716741825',
              userHomepage: homepage,
              content
            },
            {
              externalUserId: SEC_UID,
              userHomepage: homepage,
              content
            }
          ]
        }
      ],
      '风扇'
    );

    expect(prospects).toHaveLength(1);
    expect(prospects[0].evidence).toHaveLength(1);
  });

  it('无主页的评论维持既有 key 规则（externalUserId ?? 昵称）', () => {
    const prospects = aggregateProspectComments(
      [
        {
          contentId: 'v1',
          title: '风扇测评',
          comments: [
            { externalUserId: '107716741825', content: '想买一台静音的' },
            { userNickname: '小明', content: '请问多少钱一台' }
          ]
        }
      ],
      '风扇'
    );

    expect(prospects.map((p) => p.userKey).sort()).toEqual(
      ['107716741825', '小明'].sort()
    );
  });
});
