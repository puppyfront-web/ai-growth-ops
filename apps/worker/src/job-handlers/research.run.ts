import { Job } from 'bullmq';
import type { ResearchRunInput } from '../job-types.js';
import { createDatabaseClient } from '@ai-growth-ops/database';
import type { DatabaseClient } from '@ai-growth-ops/database';

export async function handleResearchRun(job: Job<ResearchRunInput>): Promise<void> {
  const { researchTaskId, platform, taskType, keywords, maxPosts, maxComments } = job.data;
  const db: DatabaseClient = createDatabaseClient();

  try {
    const task = await db.researchTask.findFirst({ where: { id: researchTaskId } });
    if (!task) {
      job.log(`Research task ${researchTaskId} not found, skipping`);
      return;
    }

    // Call research-runner service
    const runnerUrl = process.env.RESEARCH_RUNNER_URL || 'http://localhost:3300';
    const resp = await fetch(`${runnerUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        researchTaskId,
        provider: 'sandbox',
        platform,
        taskType,
        keywords,
        maxPosts,
        maxComments,
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Research runner returned ${resp.status}: ${errorText}`);
    }

    const result = await resp.json() as Record<string, unknown>;
    const posts = (result.posts || []) as Array<Record<string, unknown>>;
    const comments = (result.comments || []) as Array<Record<string, unknown>>;

    // Store collected posts (deduplicate by externalPostId)
    const existingPostIds = new Set(
      (await db.collectedPost.findMany({
        where: { researchTaskId },
        select: { externalPostId: true },
      })).map(p => p.externalPostId)
    );

    for (const post of posts) {
      const externalPostId = String(post.externalPostId);
      if (existingPostIds.has(externalPostId)) continue;
      await db.collectedPost.create({
        data: {
          researchTaskId,
          platform: platform as any,
          externalPostId,
          title: post.title as string | undefined,
          content: post.content as string | undefined,
          authorId: post.authorId as string | undefined,
          authorName: post.authorName as string | undefined,
          likeCount: post.likeCount as number | undefined,
          commentCount: post.commentCount as number | undefined,
          shareCount: post.shareCount as number | undefined,
          publishedAt: post.publishedAt ? new Date(post.publishedAt as string) : undefined,
          metadata: post.metadata as any,
        },
      });
      existingPostIds.add(externalPostId);
    }

    // Store collected comments
    for (const comment of comments) {
      await db.collectedComment.create({
        data: {
          researchTaskId,
          platform: platform as any,
          externalCommentId: String(comment.externalCommentId),
          externalPostId: comment.externalPostId as string | undefined,
          externalUserId: comment.externalUserId as string | undefined,
          externalUserName: comment.externalUserName as string | undefined,
          content: String(comment.content),
          likeCount: comment.likeCount as number | undefined,
          metadata: comment.metadata as any,
        },
      });
    }

    // Generate insights using local insight generator
    try {
      const { generateInsights } = await import('../insight-generator.js');
      await generateInsights({
        researchTaskId,
        posts: posts.map(p => ({
          title: p.title as string | undefined,
          content: p.content as string | undefined,
          authorName: p.authorName as string | undefined,
          likeCount: p.likeCount as number | undefined,
          commentCount: p.commentCount as number | undefined,
        })),
        comments: comments.map(c => ({
          content: String(c.content),
          externalUserName: c.externalUserName as string | undefined,
          likeCount: c.likeCount as number | undefined,
        })),
        keywords,
        platform,
      });
    } catch (err) {
      job.log(`Insight generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Update task status
    await db.researchTask.update({
      where: { id: researchTaskId },
      data: { status: 'INSIGHT_GENERATED', finishedAt: new Date() },
    });

    job.log(`Research task ${researchTaskId} completed: ${posts.length} posts, ${comments.length} comments`);
  } catch (err) {
    await db.researchTask.update({
      where: { id: researchTaskId },
      data: { status: 'FAILED', lastError: err instanceof Error ? err.message : String(err) },
    }).catch(() => {});
    throw err;
  } finally {
    await db.$disconnect();
  }
}
