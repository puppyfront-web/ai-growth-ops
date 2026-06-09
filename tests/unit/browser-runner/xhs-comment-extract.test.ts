import { describe, expect, it } from 'vitest';
import {
  extractCommentList,
  pickXhsNoteRef,
  xhsNotePublicUrl
} from '../../../apps/browser-runner/src/assist-routes';

describe('extractCommentList(xiaohongshu)', () => {
  it('maps data.comments array (creator center format)', () => {
    const comments = extractCommentList('xiaohongshu', {
      code: 0,
      data: {
        comments: [
          {
            id: 'c-001',
            note_id: 'note-abc',
            content: '好看！',
            create_time: 1780034744,
            user_info: { user_id: 'uid-1', nickname: '小红' },
            like_count: 3,
            sub_comment_count: 1
          }
        ]
      }
    });

    expect(comments).toEqual([
      expect.objectContaining({
        externalCommentId: 'c-001',
        externalUserId: 'uid-1',
        userNickname: '小红',
        content: '好看！',
        likeCount: 3,
        replyCount: 1,
        sourceContentId: 'note-abc',
        publishedAt: new Date(1780034744 * 1000).toISOString()
      })
    ]);
  });

  it('maps data.list array (web API /v2/comment/page format)', () => {
    const comments = extractCommentList('xiaohongshu', {
      success: true,
      data: {
        list: [
          {
            id: 'c-002',
            content: '太美了',
            create_time: 1780040000,
            user_info: { user_id: 'uid-2', nickname: '阿华' },
            like_count: 0,
            sub_comment_count: 0
          }
        ],
        cursor: 'next-cursor',
        has_more: false
      }
    });

    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      externalCommentId: 'c-002',
      externalUserId: 'uid-2',
      content: '太美了'
    });
  });

  it('falls back to author field when user_info is absent', () => {
    const comments = extractCommentList('xiaohongshu', {
      data: {
        comments: [
          {
            id: 'c-003',
            content: '路过',
            create_time: 1780050000,
            author: { user_id: 'uid-3', nickname: '游客' }
          }
        ]
      }
    });

    expect(comments[0]).toMatchObject({
      externalUserId: 'uid-3',
      userNickname: '游客'
    });
  });

  it('uses passed-in sourceContentId over note_id from payload', () => {
    const comments = extractCommentList(
      'xiaohongshu',
      {
        data: {
          comments: [
            {
              id: 'c-004',
              content: 'hi',
              create_time: 1780060000,
              user_info: { user_id: 'u4', nickname: 'X' },
              note_id: 'payload-note'
            }
          ]
        }
      },
      'caller-note'
    );

    expect(comments[0].sourceContentId).toBe('caller-note');
  });

  it('falls back to note_id from payload when no sourceContentId provided', () => {
    const comments = extractCommentList('xiaohongshu', {
      data: {
        comments: [
          {
            id: 'c-005',
            content: 'hi',
            create_time: 1780070000,
            user_info: { user_id: 'u5', nickname: 'Y' },
            note_id: 'note-from-payload'
          }
        ]
      }
    });

    expect(comments[0].sourceContentId).toBe('note-from-payload');
  });

  it('filters out items with empty externalCommentId', () => {
    const comments = extractCommentList('xiaohongshu', {
      data: {
        comments: [
          {
            id: '',
            content: 'ghost',
            create_time: 1780080000,
            user_info: { user_id: 'u6', nickname: 'Z' }
          },
          {
            id: 'c-006',
            content: 'valid',
            create_time: 1780080001,
            user_info: { user_id: 'u6', nickname: 'Z' }
          }
        ]
      }
    });

    expect(comments).toHaveLength(1);
    expect(comments[0].externalCommentId).toBe('c-006');
  });

  it('handles top-level comments key (notice/webhook payload)', () => {
    const comments = extractCommentList('xiaohongshu', {
      comments: [
        {
          id: 'c-007',
          content: '通知格式',
          create_time: 1780090000,
          user_info: { user_id: 'u7', nickname: '通知用户' }
        }
      ]
    });

    expect(comments[0]).toMatchObject({
      externalCommentId: 'c-007',
      content: '通知格式'
    });
  });

  it('returns empty array for unrecognised payload shape', () => {
    expect(extractCommentList('xiaohongshu', { weird: 'payload' })).toEqual([]);
    expect(extractCommentList('xiaohongshu', {})).toEqual([]);
  });

  it('maps liked_count and sub_comment_num field variants', () => {
    const comments = extractCommentList('xiaohongshu', {
      data: {
        comments: [
          {
            id: 'c-008',
            content: '变体字段',
            create_time: 1780100000,
            user_info: { user_id: 'u8', nickname: 'V' },
            liked_count: 10,
            sub_comment_num: 5
          }
        ]
      }
    });

    expect(comments[0]).toMatchObject({ likeCount: 10, replyCount: 5 });
  });

  it('handles millisecond create_time values', () => {
    const comments = extractCommentList('xiaohongshu', {
      data: {
        comments: [
          {
            id: 'c-009',
            content: '毫秒时间戳',
            create_time: 1779982733000,
            user_info: { user_id: 'u9', nickname: 'M' }
          }
        ]
      }
    });

    expect(comments[0].publishedAt).toBe(new Date(1779982733000).toISOString());
  });
});

describe('pickXhsNoteRef', () => {
  it('reads note id and xsec token from latest_note_data payloads', () => {
    const note = pickXhsNoteRef({
      data: {
        noteInfo: {
          id: '6a18618d0000000007013802',
          xsec_token: 'token-from-creator-api'
        }
      }
    });

    expect(note).toEqual({
      id: '6a18618d0000000007013802',
      xsecToken: 'token-from-creator-api'
    });
    expect(xhsNotePublicUrl(note.id, note.xsecToken)).toBe(
      'https://www.xiaohongshu.com/explore/6a18618d0000000007013802?xsec_token=token-from-creator-api&xsec_source=pc_creator'
    );
  });
});
