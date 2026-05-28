export interface ResearchProvider {
  readonly name: string;
  collectPosts(input: CollectPostsInput): Promise<CollectedPostData[]>;
  collectComments(input: CollectCommentsInput): Promise<CollectedCommentData[]>;
}

export interface CollectPostsInput {
  platform: string;
  keywords?: string[];
  targetAccountIds?: string[];
  maxPosts?: number;
  cookie?: string;
  cursor?: string;
}

export interface CollectCommentsInput {
  platform: string;
  postIds: string[];
  maxCommentsPerPost?: number;
  cookie?: string;
}

export interface CollectedPostData {
  externalPostId: string;
  title?: string;
  content?: string;
  authorId?: string;
  authorName?: string;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  publishedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CollectedCommentData {
  externalCommentId: string;
  externalPostId?: string;
  externalUserId?: string;
  externalUserName?: string;
  content: string;
  likeCount?: number;
  metadata?: Record<string, unknown>;
}
