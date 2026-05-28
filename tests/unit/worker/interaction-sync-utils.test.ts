import { describe, expect, it } from 'vitest';
import {
  prepareCommentsForSync,
  prepareMessagesForSync,
} from '../../../apps/worker/src/job-handlers/interaction-sync-utils';

describe('prepareCommentsForSync', () => {
  it('keeps only today comments and drops duplicates by externalCommentId', () => {
    const now = new Date('2026-05-28T12:00:00+08:00');

    const comments = prepareCommentsForSync(
      [
        {
          externalCommentId: 'comment-1',
          externalUserId: 'user-1',
          userNickname: 'A',
          content: 'today-1',
          publishedAt: '2026-05-28T08:00:00+08:00',
        },
        {
          externalCommentId: 'comment-1',
          externalUserId: 'user-1',
          userNickname: 'A',
          content: 'duplicate',
          publishedAt: '2026-05-28T08:01:00+08:00',
        },
        {
          externalCommentId: 'comment-2',
          externalUserId: 'user-2',
          userNickname: 'B',
          content: 'yesterday',
          publishedAt: '2026-05-27T23:59:59+08:00',
        },
        {
          externalCommentId: 'comment-3',
          externalUserId: 'user-3',
          userNickname: 'C',
          content: 'invalid-time',
          publishedAt: 'not-a-date',
        },
      ],
      now,
    );

    expect(comments).toEqual([
      expect.objectContaining({
        externalCommentId: 'comment-1',
        content: 'today-1',
      }),
    ]);
  });
});

describe('prepareMessagesForSync', () => {
  it('keeps only today messages and drops duplicates by externalMessageId', () => {
    const now = new Date('2026-05-28T12:00:00+08:00');

    const messages = prepareMessagesForSync(
      [
        {
          externalMessageId: 'message-1',
          externalUserId: 'user-1',
          userNickname: 'A',
          content: 'today-1',
          type: 'text' as const,
          publishedAt: '2026-05-28T09:00:00+08:00',
        },
        {
          externalMessageId: 'message-1',
          externalUserId: 'user-1',
          userNickname: 'A',
          content: 'duplicate',
          type: 'text' as const,
          publishedAt: '2026-05-28T09:01:00+08:00',
        },
        {
          externalMessageId: 'message-2',
          externalUserId: 'user-2',
          userNickname: 'B',
          content: 'yesterday',
          type: 'text' as const,
          publishedAt: '2026-05-27T10:00:00+08:00',
        },
      ],
      now,
    );

    expect(messages).toEqual([
      expect.objectContaining({
        externalMessageId: 'message-1',
        content: 'today-1',
      }),
    ]);
  });
});
