import { Job } from 'bullmq';
import type { ResearchRunInput } from '../job-types.js';
import { createDatabaseClient } from '@ai-growth-ops/database';
import type { DatabaseClient, Platform } from '@ai-growth-ops/database';
import { decryptToken } from '@ai-growth-ops/providers';
import { DefaultSkillRunner } from '@ai-growth-ops/skills';

const RUNNER_URL = process.env.BROWSER_RUNNER_URL || 'http://localhost:3200';
const RUNNER_SECRET =
  process.env.BROWSER_RUNNER_SECRET || process.env.TOKEN_ENCRYPTION_KEY || '';

export async function handleResearchRun(
  job: Job<ResearchRunInput>
): Promise<void> {
  const { researchTaskId, platform, taskType, keywords = [] } = job.data;
  const db: DatabaseClient = createDatabaseClient();

  try {
    const task = await db.researchTask.findFirst({
      where: { id: researchTaskId }
    });
    if (!task) {
      job.log(`Research task ${researchTaskId} not found, skipping`);
      return;
    }

    // Update status to running
    await db.researchTask.update({
      where: { id: researchTaskId },
      data: { status: 'RUNNING', startedAt: new Date(), lastError: null }
    });

    // ── Phase 1: Find browser-assist account and collect real data ────
    const account = await db.platformAccount.findFirst({
      where: {
        organizationId: task.organizationId ?? undefined,
        platform: platform as Platform,
        mode: 'browser_assist',
        status: 'active',
        deletedAt: null,
        cookieRef: { not: '' }
      }
    });

    if (!account) {
      throw new Error(`没有找到 ${platform} 平台的已登录账号，请先扫码登录`);
    }

    const cookie = decryptToken(account.cookieRef!);
    const allPosts: Array<Record<string, unknown>> = [];
    const allComments: Array<Record<string, unknown>> = [];

    for (const keyword of keywords.length > 0 ? keywords : ['热门内容']) {
      try {
        const resp = await fetchWithTimeout(
          `${RUNNER_URL}/assist/search-and-fetch-comments`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(RUNNER_SECRET
                ? { authorization: `Bearer ${RUNNER_SECRET}` }
                : {})
            },
            body: JSON.stringify({
              platform,
              cookie,
              keyword,
              topN: taskType === 'competitor_analysis' ? 5 : 3,
              headed: false,
              maxCommentsPerVideo: 20
            })
          },
          180_000
        );

        if (!resp.ok) {
          job.log(`Search failed for keyword "${keyword}": ${resp.status}`);
          continue;
        }

        const searchResult = (await resp.json()) as Record<string, unknown>;
        const results = (searchResult.results ?? []) as Array<
          Record<string, unknown>
        >;

        for (const video of results) {
          allPosts.push({
            externalPostId: video.contentId ?? '',
            title: video.title ?? '',
            authorName: video.author ?? '',
            commentCount:
              (video.comments as Array<Record<string, unknown>>)?.length ?? 0,
            metadata: { keyword }
          });
          for (const comment of (video.comments ?? []) as Array<
            Record<string, unknown>
          >) {
            allComments.push({
              ...comment,
              externalPostId: video.contentId ?? ''
            });
          }
        }
      } catch (err) {
        job.log(
          `Search error for keyword "${keyword}": ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }
    }

    // ── Phase 2: Store collected data (deduplicate) ──────────────────
    const existingPostIds = new Set(
      (
        await db.collectedPost.findMany({
          where: { researchTaskId },
          select: { externalPostId: true }
        })
      ).map((p) => p.externalPostId)
    );

    for (const post of allPosts) {
      const externalPostId = String(post.externalPostId);
      if (existingPostIds.has(externalPostId)) continue;
      await db.collectedPost.create({
        data: {
          researchTaskId,
          platform: platform as Platform,
          externalPostId,
          title: post.title as string | undefined,
          content: post.content as string | undefined,
          authorId: post.authorId as string | undefined,
          authorName: post.authorName as string | undefined,
          likeCount: post.likeCount as number | undefined,
          commentCount: post.commentCount as number | undefined,
          shareCount: post.shareCount as number | undefined,
          publishedAt: post.publishedAt
            ? new Date(post.publishedAt as string)
            : undefined,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metadata: post.metadata as any
        }
      });
      existingPostIds.add(externalPostId);
    }

    for (const comment of allComments) {
      await db.collectedComment.create({
        data: {
          researchTaskId,
          platform: platform as Platform,
          externalCommentId: String(
            comment.externalCommentId ?? comment.id ?? ''
          ),
          externalPostId: comment.externalPostId as string | undefined,
          externalUserId: comment.externalUserId as string | undefined,
          externalUserName: comment.externalUserName as string | undefined,
          content: String(comment.content ?? comment.text ?? ''),
          likeCount: comment.likeCount as number | undefined,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metadata: comment.metadata as any
        }
      });
    }

    // ── Phase 3: Generate AI insights ────────────────────────────────
    try {
      const runner = new DefaultSkillRunner();
      const result = await runner.run({
        skillName: 'research-insight',
        input: {
          posts: allPosts.slice(0, 20).map((p) => ({
            title: p.title,
            content: p.content,
            likeCount: p.likeCount,
            commentCount: p.commentCount
          })),
          comments: allComments.slice(0, 50).map((c) => ({
            text: String(c.content ?? c.text ?? ''),
            user: c.externalUserName
          })),
          keywords,
          platform
        }
      });

      if (result.status === 'success' && result.output) {
        const output = result.output as Record<string, unknown>;

        const insights = [
          {
            type: 'pain_points',
            title: '用户痛点分析',
            data: output.painPoints as unknown
          },
          {
            type: 'popular_topics',
            title: '热门话题趋势',
            data: output.popularTopics as unknown
          },
          {
            type: 'content_angles',
            title: '内容创作角度',
            data: output.contentAngles as unknown
          }
        ];

        for (const insight of insights) {
          const items = Array.isArray(insight.data)
            ? insight.data
            : [insight.data];
          if (!items.length) continue;
          await db.researchInsight.create({
            data: {
              researchTaskId,
              type: insight.type,
              title: insight.title,
              summary: items.slice(0, 3).map(String).join('；'),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data: insight.data as any
            }
          });
        }

        const opportunities = (output.suggestedOpportunities ?? []) as Array<
          Record<string, unknown>
        >;
        for (const opp of opportunities.slice(0, 5)) {
          await db.contentOpportunity.create({
            data: {
              researchTaskId,
              title: String(opp.title ?? ''),
              description: String(opp.evidence ?? opp.format ?? ''),
              platforms: [platform],
              priority: String(opp.priority ?? 'medium')
            }
          });
        }
      }
    } catch (err) {
      job.log(
        `AI insight generation failed: ${err instanceof Error ? err.message : String(err)}`
      );
      // Fallback to rule-based
      try {
        const { generateInsights } = await import('../insight-generator.js');
        await generateInsights({
          researchTaskId,
          posts: allPosts.map((p) => ({
            title: p.title as string | undefined,
            content: p.content as string | undefined,
            authorName: p.authorName as string | undefined,
            likeCount: p.likeCount as number | undefined,
            commentCount: p.commentCount as number | undefined
          })),
          comments: allComments.map((c) => ({
            content: String(c.content ?? c.text ?? ''),
            externalUserName: c.externalUserName as string | undefined,
            likeCount: c.likeCount as number | undefined
          })),
          keywords,
          platform
        });
      } catch (fallbackErr) {
        job.log(
          `Rule-based insight generation also failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`
        );
      }
    }

    // Update task status
    await db.researchTask.update({
      where: { id: researchTaskId },
      data: { status: 'INSIGHT_GENERATED', finishedAt: new Date() }
    });

    job.log(
      `Research task ${researchTaskId} completed: ${allPosts.length} posts, ${allComments.length} comments`
    );
  } catch (err) {
    await db.researchTask
      .update({
        where: { id: researchTaskId },
        data: {
          status: 'FAILED',
          lastError: err instanceof Error ? err.message : String(err),
          finishedAt: new Date()
        }
      })
      .catch(() => {});
    throw err;
  } finally {
    await db.$disconnect();
  }
}

function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 30_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}
