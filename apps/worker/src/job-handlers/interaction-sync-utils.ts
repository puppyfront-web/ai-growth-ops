import type { PlatformComment, PlatformMessage } from '@ai-growth-ops/connectors';
import { dedupeByKey, isPublishedTodayInShanghai } from '@ai-growth-ops/shared';

export function prepareCommentsForSync(
  comments: PlatformComment[],
  now: Date = new Date(),
): PlatformComment[] {
  return dedupeByKey(comments, (comment) => comment.externalCommentId).filter((comment) =>
    isPublishedTodayInShanghai(comment.publishedAt, now),
  );
}

export function prepareMessagesForSync(
  messages: PlatformMessage[],
  now: Date = new Date(),
): PlatformMessage[] {
  return dedupeByKey(messages, (message) => message.externalMessageId).filter((message) =>
    isPublishedTodayInShanghai(message.publishedAt, now),
  );
}
