import { describe, expect, it } from 'vitest';
import {
  extractCommentList,
  extractMessageList,
  findDouyinWorkItemBySourceId,
  isDouyinEncodedItemId,
  isOfficialDouyinInboxNoise,
  pickDouyinEncodedItemId,
  pickDouyinItemId,
  pickSafeDouyinItemId
} from '../../../apps/browser-runner/src/assist-routes';

describe('extractCommentList(douyin)', () => {
  it('maps creator notice/comment payload fields', () => {
    const comments = extractCommentList('douyin', {
      status_code: 0,
      comments: [
        {
          id: '@comment-id',
          item_id: '@item-id',
          text: '刚出来的[捂脸]',
          time_stamp: '1780034744',
          nick_name: '小明',
          user_id: 'uid-1'
        }
      ]
    });

    expect(comments).toEqual([
      expect.objectContaining({
        externalCommentId: '@comment-id',
        externalUserId: 'uid-1',
        userNickname: '小明',
        content: '刚出来的[捂脸]',
        sourceContentId: '@item-id',
        publishedAt: new Date(1780034744 * 1000).toISOString()
      })
    ]);
  });

  it('unwraps nested comment objects from notice inbox payloads', () => {
    const comments = extractCommentList('douyin', {
      data: {
        comment_notice_list: [
          {
            aweme_id: '7682448472766680354',
            comment: {
              cid: 'notice-c1',
              text: '想了解报价',
              user: { uid: 'u-2', nickname: '采购娟姐' },
              time_stamp: '1780034744'
            }
          }
        ]
      }
    });
    expect(comments).toEqual([
      expect.objectContaining({
        externalCommentId: 'notice-c1',
        externalUserId: 'u-2',
        userNickname: '采购娟姐',
        content: '想了解报价',
        sourceContentId: '7682448472766680354'
      })
    ]);
  });

  it('flattens nested comment replies into the same list', () => {
    const comments = extractCommentList('douyin', {
      data: {
        comments: [
          {
            cid: 'parent-1',
            text: '这个多少钱，想采购',
            user: { uid: 'u-parent', nickname: '楼主甲', sec_uid: 'sec-a' },
            reply_comment: [
              {
                cid: 'reply-1',
                text: '同求报价，我们厂也在找',
                user: {
                  uid: 'u-reply',
                  nickname: '采购乙',
                  sec_uid: 'sec-b'
                },
                create_time: 1780034800
              }
            ]
          }
        ]
      }
    });
    expect(comments).toHaveLength(2);
    expect(comments[0]).toEqual(
      expect.objectContaining({
        externalCommentId: 'parent-1',
        userNickname: '楼主甲',
        content: '这个多少钱，想采购'
      })
    );
    expect(comments[1]).toEqual(
      expect.objectContaining({
        externalCommentId: 'reply-1',
        externalUserId: 'u-reply',
        userNickname: '采购乙',
        userHomepage: 'https://www.douyin.com/user/sec-b',
        content: '同求报价，我们厂也在找'
      })
    );
  });
});

describe('pickDouyinItemId', () => {
  it('reads the first item id from creator item list payloads', () => {
    expect(
      pickDouyinItemId({
        items: [{ item_id: '@video-1', aweme_id: '@video-2' }]
      })
    ).toBe('@video-1');
  });

  it('reads item_id from notice comment payloads', () => {
    expect(
      pickDouyinItemId({
        comments: [{ id: '@c1', item_id: '@video-from-notice', text: 'hi' }]
      })
    ).toBe('@video-from-notice');
  });

  it('prefers encoded item_id over numeric aweme_id in item list payloads', () => {
    expect(
      pickDouyinItemId({
        items: [{ item_id: '@encoded-video', aweme_id: '7645170608578278769' }]
      })
    ).toBe('@encoded-video');
    expect(
      pickDouyinEncodedItemId({
        items: [{ aweme_id: '7645170608578278769' }]
      })
    ).toBeUndefined();
    expect(isDouyinEncodedItemId('@encoded-video')).toBe(true);
    expect(isDouyinEncodedItemId('7645170608578278769')).toBe(false);
  });

  it('prefers string aweme_id over truncated numeric item_id', () => {
    expect(
      pickSafeDouyinItemId({
        item_id: 7682448472766680000,
        aweme_id: '7682448472766680354',
        group_id: 7682448472766680000
      })
    ).toBe('7682448472766680354');
  });

  it('reads aweme_id from creator work_list payloads', () => {
    expect(
      pickDouyinItemId({
        aweme_list: [
          {
            item_id: 7682448472766680000,
            aweme_id: '7682448472766680354',
            aweme_type: 2
          }
        ]
      })
    ).toBe('7682448472766680354');
  });
});

describe('findDouyinWorkItemBySourceId', () => {
  const workList = {
    aweme_list: [
      {
        aweme_id: '1111111111111111111',
        item_id: '@other-note',
        aweme_type: 2,
        statistics: { comment_count: 0 }
      },
      {
        aweme_id: '7682448472766680354',
        item_id: '@published-note',
        aweme_type: 2,
        statistics: { comment_count: 1 }
      }
    ]
  };

  it('matches a numeric aweme_id to the correct work row', () => {
    expect(
      findDouyinWorkItemBySourceId(workList, '7682448472766680354')
    ).toEqual({
      id: '@published-note',
      awemeType: 2
    });
  });

  it('prefers a work with comments when sourceContentId is missing', () => {
    expect(findDouyinWorkItemBySourceId(workList)).toEqual({
      id: '@published-note',
      awemeType: 2
    });
  });
});

describe('extractMessageList(douyin)', () => {
  it('maps creator user_message_list conversations', () => {
    const messages = extractMessageList('douyin', {
      status_code: 0,
      user_message_list: [
        {
          user_message_id: 'm-9',
          conversation_id: 'conv-1',
          user: { uid: 'u-9', nickname: '采购经理' },
          last_message: {
            message_id: 'm-9',
            content: '{"text":"想了解报价"}',
            create_time: 1788700000
          }
        }
      ]
    });

    expect(messages).toEqual([
      expect.objectContaining({
        externalMessageId: 'm-9',
        externalUserId: 'u-9',
        userNickname: '采购经理',
        content: '想了解报价',
        publishedAt: new Date(1788700000 * 1000).toISOString()
      })
    ]);
  });

  it('maps creator notice_list payload fields', () => {
    const messages = extractMessageList('douyin', {
      data: {
        notice_list: [
          {
            notice_id: 'n-1',
            text: '你好，想咨询一下',
            create_time: 1788700000,
            user: { uid: 'u-1', nickname: '采购经理' }
          }
        ]
      }
    });

    expect(messages).toEqual([
      expect.objectContaining({
        externalMessageId: 'n-1',
        externalUserId: 'u-1',
        userNickname: '采购经理',
        content: '你好，想咨询一下',
        publishedAt: new Date(1788700000 * 1000).toISOString()
      })
    ]);
  });

  it('drops official platform notices from the inbox', () => {
    const messages = extractMessageList('douyin', {
      user_message_list: [
        {
          user_message_id: 'official-1',
          user: { uid: 'sys', nickname: '抖音官方' },
          last_message: {
            content: '{"text":"账号认证清退通知"}',
            create_time: 1788700000
          }
        }
      ]
    });
    expect(messages).toEqual([]);
    expect(
      isOfficialDouyinInboxNoise({
        userNickname: '采购经理',
        content: '想了解报价'
      })
    ).toBe(false);
    expect(
      isOfficialDouyinInboxNoise({
        userNickname: '',
        content:
          '<p>为保障抖音个人认证体系的准确性与一致性，自2026年9月15日起，平台将逐步清退已无申请入口的个人认证黄V'
      })
    ).toBe(true);
  });
});
