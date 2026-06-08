/**
 * Campaign Execution Handler
 *
 * Orchestrates the full content pipeline for a campaign run:
 * content-writing → platform-rewrite → compliance → publish
 */

import { Job } from 'bullmq';
import { createDatabaseClient } from '@ai-growth-ops/database';
import { DefaultSkillRunner } from '@ai-growth-ops/skills';
import { getQueue, QUEUE_NAMES } from '../queue.js';

let _skillRunner: DefaultSkillRunner | null = null;
function getSkillRunner(): DefaultSkillRunner {
  if (!_skillRunner) _skillRunner = new DefaultSkillRunner();
  return _skillRunner;
}

export async function handleCampaignExecute(job: Job): Promise<void> {
  const { campaignRunId } = job.data as { campaignRunId: string };
  const db = createDatabaseClient();

  const run = await db.campaignRun.findUnique({
    where: { id: campaignRunId },
    include: { campaign: true },
  });
  if (!run || !run.campaign) throw new Error(`CampaignRun ${campaignRunId} not found`);

  const campaign = run.campaign;
  const topicConfig = (campaign.topicConfig as Record<string, unknown>) || {};

  try {
    // Step 1: Generate content
    await updateRun(db, run.id, 'generating_content');
    const contentResult = await getSkillRunner().run({
      skillName: 'content-writing',
      input: {
        topic: topicConfig.topic || 'general',
        contentType: campaign.contentType,
        keywords: topicConfig.keywords || [],
        brandTone: topicConfig.brandTone || '专业、友好',
      },
    });

    const title = contentResult.status === 'success' && contentResult.output
      ? (contentResult.output as Record<string, unknown>).title as string || topicConfig.topic as string
      : topicConfig.topic as string;
    const body = contentResult.status === 'success' && contentResult.output
      ? (contentResult.output as Record<string, unknown>).body as string || ''
      : '';

    // Step 2: Find or create default project
    let project = await db.contentProject.findFirst({
      where: { organizationId: campaign.organizationId, title: '默认项目' },
    });
    if (!project) {
      project = await db.contentProject.create({
        data: {
          organizationId: campaign.organizationId,
          userId: campaign.userId,
          title: '默认项目',
          status: 'draft',
        },
      });
    }

    // Step 3: Create ContentItem
    const contentItem = await db.contentItem.create({
      data: {
        organizationId: campaign.organizationId,
        userId: campaign.userId,
        projectId: project.id,
        type: campaign.contentType as 'text_image' | 'video' | 'article',
        title: title as string,
        body: body as string,
        sourceType: 'campaign',
        status: 'draft',
      },
    });

    // Step 4: Generate platform variants
    const platforms = (campaign.platforms as string[]) || [];
    for (const platform of platforms) {
      try {
        const rewriteResult = await getSkillRunner().run({
          skillName: 'platform-rewrite',
          input: {
            sourceTitle: title,
            sourceBody: body,
            platform,
            contentType: campaign.contentType,
          },
        });

        const variantData = rewriteResult.status === 'success' && rewriteResult.output
          ? rewriteResult.output as Record<string, unknown>
          : { title, body };

        await db.contentVariant.create({
          data: {
            organizationId: campaign.organizationId,
            userId: campaign.userId,
            contentItemId: contentItem.id,
            platform: platform as 'douyin' | 'xiaohongshu' | 'wechat_official' | 'wechat_channels' | 'baijiahao' | 'zhihu',
            contentType: campaign.contentType as 'text_image' | 'video' | 'article',
            title: (variantData.title as string) || (title as string),
            body: (variantData.body as string) || (body as string),
            tags: variantData.hashtags || [],
            complianceStatus: 'pending',
          },
        });
      } catch (err) {
        console.error(`[campaign] Variant creation failed for ${platform}:`, err);
      }
    }

    // Step 5: Compliance check
    if (campaign.autoCompliance) {
      await updateRun(db, run.id, 'compliance');
      const variants = await db.contentVariant.findMany({
        where: { contentItemId: contentItem.id },
      });

      for (const variant of variants) {
        try {
          const complianceResult = await getSkillRunner().run({
            skillName: 'compliance-check',
            input: {
              title: variant.title,
              body: variant.body,
              platform: variant.platform,
              contentType: variant.contentType,
            },
          });

          const passed = complianceResult.status === 'success' && complianceResult.output
            ? (complianceResult.output as Record<string, unknown>).passed !== false
            : true;

          await db.contentVariant.update({
            where: { id: variant.id },
            data: { complianceStatus: passed ? 'approved' : 'rejected' },
          });
        } catch (err) {
          console.error(`[campaign] Compliance failed for variant ${variant.id}:`, err);
        }
      }
    }

    // Step 6: Auto-publish approved variants
    if (campaign.autoPublish) {
      await updateRun(db, run.id, 'publishing');
      const approvedVariants = await db.contentVariant.findMany({
        where: { contentItemId: contentItem.id, complianceStatus: 'approved' },
      });

      for (const variant of approvedVariants) {
        const account = await db.platformAccount.findFirst({
          where: {
            organizationId: campaign.organizationId,
            platform: variant.platform,
            deletedAt: null,
          },
        });

        if (!account) {
          console.log(`[campaign] No account for ${variant.platform}, skipping`);
          continue;
        }

        const publishJob = await db.publishJob.create({
          data: {
            organizationId: campaign.organizationId,
            userId: campaign.userId,
            contentVariantId: variant.id,
            platformAccountId: account.id,
            platform: variant.platform,
            contentType: variant.contentType,
            mode: 'browser_assist',
            status: 'DRAFT',
          },
        });

        const publishQueue = getQueue(QUEUE_NAMES.PUBLISH_EXECUTE);
        await publishQueue.add(QUEUE_NAMES.PUBLISH_EXECUTE, {
          publishJobId: publishJob.id,
          contentVariantId: variant.id,
          platformAccountId: account.id,
          platform: variant.platform,
          contentType: variant.contentType,
          mode: 'browser_assist',
        }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
      }
    }

    // Step 7: Finalize
    await updateRun(db, run.id, 'completed');
    await db.campaignRun.update({
      where: { id: run.id },
      data: { contentItemId: contentItem.id, finishedAt: new Date() },
    });
    await db.campaign.update({
      where: { id: campaign.id },
      data: { publishedCount: { increment: 1 } },
    });

    console.log(`[campaign] Run ${campaignRunId} completed`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db.campaignRun.update({
      where: { id: run.id },
      data: { status: 'failed', errorMessage, finishedAt: new Date() },
    });
    console.error(`[campaign] Run ${campaignRunId} failed:`, errorMessage);
    throw err;
  }
}

async function updateRun(db: ReturnType<typeof createDatabaseClient>, runId: string, status: string) {
  await db.campaignRun.update({
    where: { id: runId },
    data: {
      status,
      ...(status === 'generating_content' ? { startedAt: new Date() } : {}),
    },
  });
}
