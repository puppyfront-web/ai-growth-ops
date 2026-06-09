import { describe, expect, it } from 'vitest';
import {
  extractCommentList,
  isDouyinEncodedItemId,
  pickDouyinEncodedItemId,
  pickDouyinItemId
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
});
