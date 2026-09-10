import type {
  PlatformComment,
  PlatformMessage
} from '@ai-growth-ops/connectors';
import {
  RECENT_INTERACTION_FALLBACK_LIMIT,
  selectTodayOrRecent
} from '@ai-growth-ops/shared';

export function prepareCommentsForSync(
  comments: PlatformComment[],
  now: Date = new Date(),
  limit = 50
): PlatformComment[] {
  return selectTodayOrRecent(
    comments,
    (comment) => comment.externalCommentId,
    (comment) => comment.publishedAt,
    { limit, fallbackLimit: RECENT_INTERACTION_FALLBACK_LIMIT, now }
  );
}

export function prepareMessagesForSync(
  messages: PlatformMessage[],
  now: Date = new Date(),
  limit = 50
): PlatformMessage[] {
  return selectTodayOrRecent(
    messages,
    (message) => message.externalMessageId,
    (message) => message.publishedAt,
    { limit, fallbackLimit: RECENT_INTERACTION_FALLBACK_LIMIT, now }
  );
}
