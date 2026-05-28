import type { Platform, ResearchStatus } from './enums';

export type ResearchTask = {
  id: string;
  userId: string;
  type: string;
  platforms: unknown;
  keywords: unknown;
  targetAccountConfigs: unknown;
  status: ResearchStatus;
  provider: string | null;
  rateLimitPolicy: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  metadata: unknown;
  /** Included by backend list/detail endpoints */
  insights?: ResearchInsight[];
  /** Included by backend list/detail endpoints */
  opportunities?: ContentOpportunity[];
};

export type CollectedPost = {
  id: string;
  researchTaskId: string;
  platform: Platform;
  externalPostId: string;
  title: string | null;
  content: string | null;
  authorId: string | null;
  authorName: string | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  publishedAt: string | null;
  collectedAt: string;
  metadata: unknown;
};

export type CollectedComment = {
  id: string;
  researchTaskId: string;
  platform: Platform;
  externalCommentId: string;
  externalPostId: string | null;
  externalUserId: string | null;
  externalUserName: string | null;
  content: string;
  likeCount: number | null;
  collectedAt: string;
  metadata: unknown;
};

export type ResearchInsight = {
  id: string;
  researchTaskId: string;
  type: string;
  title: string;
  summary: string | null;
  data: unknown;
  createdAt: string;
};

export type ContentOpportunity = {
  id: string;
  researchTaskId: string;
  title: string;
  description: string | null;
  platforms: unknown;
  priority: string | null;
  status: string;
  createdAt: string;
};
