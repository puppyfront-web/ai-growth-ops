import { Job } from 'bullmq';
import type { PublishExecuteInput } from '../job-types.js';
import { getOrCreatePublishConnector } from '@ai-growth-ops/connectors';
import type { PlatformCode, InteractionMode } from '@ai-growth-ops/connectors';
import { createDatabaseClient } from '@ai-growth-ops/database';
import type { DatabaseClient } from '@ai-growth-ops/database';
import { updatePublishProgress } from '../publish-progress.js';
import { resolveMediaFilePaths } from '../resolve-media-paths.js';

export async function handlePublishExecute(
  job: Job<PublishExecuteInput>
): Promise<void> {
  const {
    publishJobId,
    contentVariantId: _contentVariantId,
    platformAccountId,
    platform,
    contentType,
    mode
  } = job.data;

  const db: DatabaseClient = createDatabaseClient();
  let attempt: { id: string } | null = null;

  try {
    // Fetch the publish job with variant and account info
    const publishJob = await db.publishJob.findFirst({
      where: { id: publishJobId },
      include: {
        contentVariant: { include: { contentItem: true } },
        platformAccount: true
      }
    });

    if (!publishJob) {
      throw new Error(`PublishJob ${publishJobId} not found`);
    }

    if (publishJob.status !== 'RUNNING') {
      await db.publishJob.update({
        where: { id: publishJobId },
        data: { status: 'RUNNING', startedAt: new Date() }
      });
    }
    await updatePublishProgress(db, publishJobId, 'starting');

    const variant = publishJob.contentVariant;
    const account = publishJob.platformAccount;

    // Create a PublishAttempt record
    const attemptCount = await db.publishAttempt.count({
      where: { publishJobId }
    });
    attempt = await db.publishAttempt.create({
      data: {
        publishJobId,
        attemptNo: attemptCount + 1,
        status: 'running',
        startedAt: new Date()
      }
    });

    if (mode === 'browser_assist') {
      await updatePublishProgress(
        db,
        publishJobId,
        'browser_launch',
        '正在连接浏览器发布服务…'
      );
      const variantIds =
        Array.isArray(variant?.mediaAssetIds) &&
        (variant.mediaAssetIds as string[]).length > 0
          ? (variant.mediaAssetIds as string[])
          : (((variant?.contentItem?.metadata as Record<string, unknown>)
              ?.mediaAssetIds as string[] | undefined) ?? []);
      const mediaFilePaths = await resolveMediaFilePaths(db, variantIds);
      const result = await executeBrowserAssistPublish({
        publishJobId,
        variant,
        account,
        contentType,
        mediaFilePaths
      });

      if (result.success) {
        await updatePublishProgress(db, publishJobId, 'done');
        await db.publishAttempt.update({
          where: { id: attempt.id },
          data: { status: 'success', finishedAt: new Date() }
        });
        await db.publishJob.update({
          where: { id: publishJobId },
          data: {
            status: 'PUBLISHED',
            finishedAt: new Date(),
            externalPostId: result.externalPostId,
            externalUrl: result.externalUrl
          }
        });
        // Update parent ContentItem status to reflect published state
        if (variant?.contentItem?.id) {
          await db.contentItem.update({
            where: { id: variant.contentItem.id },
            data: { status: 'ready' }
          });
        }
      } else {
        const err = result.errorMessage || 'Browser assist publish failed';
        const needsHuman =
          /二次安全验证|二次验证|second-verify|uc-second-verify|登录已失效|需要.*素材|图文素材已上传/.test(
            err
          );
        await updatePublishProgress(db, publishJobId, 'failed', err);
        if (needsHuman) {
          await db.publishAttempt.update({
            where: { id: attempt.id },
            data: { status: 'failed', finishedAt: new Date(), error: err }
          });
          await db.publishJob.update({
            where: { id: publishJobId },
            data: { status: 'WAITING_HUMAN_CONFIRM', lastError: err }
          });
        } else {
          await handlePublishFailure(db, publishJobId, attempt.id, err);
        }
      }
      return;
    }

    // Handle official_api / sandbox / recorded mode
    const connector = getOrCreatePublishConnector(
      platform as PlatformCode,
      mode as InteractionMode,
      { mode: mode as InteractionMode }
    );

    const capabilities = await connector.getCapabilities();
    if (!capabilities.publishContent) {
      await updatePublishProgress(
        db,
        publishJobId,
        'failed',
        '平台不支持 API 发布'
      );
      await db.publishJob.update({
        where: { id: publishJobId },
        data: {
          status: 'NEED_MANUAL_REPAIR',
          lastError: 'Platform does not support API publishing'
        }
      });
      await db.publishAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          error: 'Platform does not support API publishing'
        }
      });
      return;
    }

    await updatePublishProgress(db, publishJobId, 'api_publish');
    const publishResult = await connector.publishContent({
      platformAccountId,
      contentType: contentType as 'text_image' | 'video' | 'article' | 'answer',
      title: variant?.title || undefined,
      content: variant?.body || '',
      tags: variant?.tags as string[] | undefined
    });

    if (publishResult.success) {
      await updatePublishProgress(db, publishJobId, 'done');
      await db.publishAttempt.update({
        where: { id: attempt.id },
        data: { status: 'success', finishedAt: new Date() }
      });
      await db.publishJob.update({
        where: { id: publishJobId },
        data: {
          status:
            publishResult.status === 'pending_review'
              ? 'WAITING_HUMAN_CONFIRM'
              : 'PUBLISHED',
          finishedAt: new Date(),
          externalPostId: publishResult.externalPostId,
          externalUrl: publishResult.externalUrl
        }
      });
      // Update parent ContentItem status to reflect published state
      if (
        publishResult.status !== 'pending_review' &&
        variant?.contentItem?.id
      ) {
        await db.contentItem.update({
          where: { id: variant.contentItem.id },
          data: { status: 'ready' }
        });
      }
    } else {
      await updatePublishProgress(
        db,
        publishJobId,
        'failed',
        publishResult.errorMessage
      );
      await handlePublishFailure(
        db,
        publishJobId,
        attempt.id,
        publishResult.errorMessage || 'Publish failed'
      );
    }

    job.log(
      `Publish completed: ${publishResult.success ? 'success' : 'failed'}`
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await updatePublishProgress(db, publishJobId, 'failed', errorMessage).catch(
      () => {}
    );
    // Close the attempt record if one was created
    if (attempt) {
      await db.publishAttempt
        .update({
          where: { id: attempt.id },
          data: {
            status: 'failed',
            finishedAt: new Date(),
            error: errorMessage.slice(0, 500)
          }
        })
        .catch(() => {});
    }
    await db.publishJob
      .update({
        where: { id: publishJobId },
        data: {
          status: 'FAILED',
          lastError: errorMessage,
          finishedAt: new Date()
        }
      })
      .catch(() => {});
    throw err;
  }

  // Disconnect AFTER all updates are confirmed, not in finally()
  // (finally runs before catch's updates complete)
  await db.$disconnect().catch(() => {});
}

async function handlePublishFailure(
  db: DatabaseClient,
  publishJobId: string,
  attemptId: string,
  errorMessage: string
) {
  await db.publishAttempt.update({
    where: { id: attemptId },
    data: { status: 'failed', finishedAt: new Date(), error: errorMessage }
  });

  const job = await db.publishJob.findFirst({ where: { id: publishJobId } });
  const retryCount = job?.retryCount || 0;
  const maxRetries = 3;

  if (retryCount >= maxRetries) {
    await db.publishJob.update({
      where: { id: publishJobId },
      data: { status: 'NEED_MANUAL_REPAIR', lastError: errorMessage }
    });
  } else {
    await db.publishJob.update({
      where: { id: publishJobId },
      data: {
        status: 'FAILED',
        lastError: errorMessage,
        retryCount: { increment: 1 }
      }
    });
  }
}

async function executeBrowserAssistPublish(params: {
  publishJobId: string;
  variant: { title?: string | null; body?: string | null; tags?: unknown };
  account: { platform: string; cookieRef?: string | null };
  contentType: string;
  mediaFilePaths?: string[];
}): Promise<{
  success: boolean;
  externalPostId?: string;
  externalUrl?: string;
  errorMessage?: string;
}> {
  const runnerUrl = process.env.BROWSER_RUNNER_URL || 'http://localhost:3200';
  const runnerSecret =
    process.env.BROWSER_RUNNER_SECRET || process.env.TOKEN_ENCRYPTION_KEY || '';
  const runnerAuthHeaders: Record<string, string> = {
    'content-type': 'application/json'
  };
  if (runnerSecret)
    runnerAuthHeaders['authorization'] = `Bearer ${runnerSecret}`;

  try {
    // Get decrypted cookie from account
    const { decryptToken } = await import('@ai-growth-ops/providers');
    const cookie = params.account.cookieRef
      ? decryptToken(params.account.cookieRef)
      : '';
    if (!cookie) {
      return {
        success: false,
        errorMessage: 'No browser cookie available for platform account'
      };
    }

    const resp = await fetch(`${runnerUrl}/assist/publish`, {
      method: 'POST',
      headers: runnerAuthHeaders,
      signal: AbortSignal.timeout(5 * 60_000), // 5 min timeout for video uploads etc.
      body: JSON.stringify({
        publishJobId: params.publishJobId,
        platform: params.account.platform,
        cookie,
        contentType: params.contentType,
        title: params.variant?.title || '',
        content: params.variant?.body || '',
        tags: params.variant?.tags || [],
        mediaFilePaths: params.mediaFilePaths ?? []
      })
    });

    const data = (await resp.json()) as Record<string, unknown>;
    return {
      success: data.success as boolean,
      externalPostId: data.externalPostId as string | undefined,
      externalUrl: data.externalUrl as string | undefined,
      errorMessage: data.errorMessage as string | undefined
    };
  } catch (err) {
    return {
      success: false,
      errorMessage:
        err instanceof Error ? err.message : 'Failed to call browser-runner'
    };
  }
}
