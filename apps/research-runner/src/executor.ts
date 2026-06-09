import type {
  ResearchProvider,
  CollectPostsInput,
  CollectCommentsInput,
  CollectedPostData,
  CollectedCommentData
} from './types.js';
import { SandboxResearchProvider } from './sandbox-provider.js';

const providers = new Map<string, ResearchProvider>();

// Register sandbox provider by default
providers.set('sandbox', new SandboxResearchProvider());

export function registerProvider(provider: ResearchProvider): void {
  providers.set(provider.name, provider);
}

export function getProvider(name: string): ResearchProvider | undefined {
  return providers.get(name);
}

export interface ExecuteResearchInput {
  researchTaskId: string;
  provider: string;
  platform: string;
  taskType: string;
  keywords?: string[];
  maxPosts?: number;
  maxComments?: number;
  targetAccountIds?: string[];
  cookie?: string;
}

export interface ExecuteResearchResult {
  postsCollected: number;
  commentsCollected: number;
  posts: CollectedPostData[];
  comments: CollectedCommentData[];
}

export async function executeResearch(
  input: ExecuteResearchInput
): Promise<ExecuteResearchResult> {
  const provider = providers.get(input.provider);
  if (!provider) {
    throw new Error(
      `Research provider not found: ${input.provider}. Available: ${Array.from(providers.keys()).join(', ')}`
    );
  }

  // Collect posts
  const postsInput: CollectPostsInput = {
    platform: input.platform,
    keywords: input.keywords,
    targetAccountIds: input.targetAccountIds,
    maxPosts: input.maxPosts || 20,
    cookie: input.cookie
  };

  const posts = await provider.collectPosts(postsInput);

  // Collect comments for collected posts
  const postIds = posts.map((p) => p.externalPostId);
  const commentsInput: CollectCommentsInput = {
    platform: input.platform,
    postIds,
    maxCommentsPerPost: input.maxComments || 5,
    cookie: input.cookie
  };

  const comments = await provider.collectComments(commentsInput);

  return {
    postsCollected: posts.length,
    commentsCollected: comments.length,
    posts,
    comments
  };
}
