import type { DatabaseClient } from '@ai-growth-ops/database';
import { DefaultSkillRunner } from '@ai-growth-ops/skills';
import { generateMediaAsset } from './media-generation.js';

// NOTE: The route handler for POST /api/content-items/generate-with-media needs to be
// added to apps/api/src/routes.ts after the Phase 1 agent finishes modifying that file.
// The route should call generateContentWithMedia(ctx.db, { ...body, orgId, userId }).

interface GenerateContentWithMediaOptions {
  topic: string;
  contentType: string;
  keywords?: string[];
  brandTone?: string;
  imageStyle?: string;
  imageCount?: number;
  orgId: string;
  userId: string;
}

export async function generateContentWithMedia(
  db: DatabaseClient,
  options: GenerateContentWithMediaOptions
) {
  const {
    topic,
    contentType,
    keywords = [],
    brandTone = '专业、友好',
    imageStyle,
    imageCount = 1,
    orgId,
    userId
  } = options;

  // Step 1: Generate content via content-writing skill
  const runner = new DefaultSkillRunner();
  const contentResult = await runner.run({
    skillName: 'content-writing',
    input: { topic, contentType, keywords, brandTone }
  });

  if (contentResult.status !== 'success' || !contentResult.output) {
    throw new Error('Content generation failed');
  }

  const output = contentResult.output as Record<string, unknown>;
  const title = (output.title as string) || topic;
  const body = (output.body as string) || '';

  // Step 2: Generate images if text_image content type
  const mediaAssets: Array<Record<string, unknown>> = [];
  if ((contentType === 'text_image' || !contentType) && imageStyle) {
    // Use imagePrompts from skill output if available, else derive from content
    const prompts: Array<{ prompt: string; purpose: string }> =
      (output.imagePrompts as Array<{ prompt: string; purpose: string }>) || [];
    const fallbackPrompts =
      prompts.length === 0
        ? [
            {
              prompt: `${imageStyle} style illustration for: ${title}. ${body.slice(0, 100)}`,
              purpose: 'main'
            }
          ]
        : prompts;

    for (
      let i = 0;
      i < Math.min(imageCount, fallbackPrompts.length || 1);
      i++
    ) {
      try {
        const prompt =
          fallbackPrompts[i]?.prompt ||
          fallbackPrompts[0]?.prompt ||
          `${imageStyle} illustration for social media post about ${topic}`;
        const asset = await generateMediaAsset(db, {
          prompt,
          style: imageStyle,
          orgId,
          userId
        });
        mediaAssets.push(asset);
      } catch (err) {
        console.error('[content-media] Image generation failed:', err);
      }
    }
  }

  // Step 3: Find or create default project
  let project = await db.contentProject.findFirst({
    where: { organizationId: orgId, title: '默认项目' }
  });
  if (!project) {
    project = await db.contentProject.create({
      data: {
        organizationId: orgId,
        userId,
        title: '默认项目',
        status: 'draft'
      }
    });
  }

  // Step 4: Create ContentItem with media
  const mediaAssetIds = mediaAssets.map((a) => a.id);
  const contentItem = await db.contentItem.create({
    data: {
      organizationId: orgId,
      userId,
      projectId: project.id,
      type: (contentType || 'text_image') as never,
      title,
      body,
      sourceType: 'ai_generated',
      status: 'draft',
      metadata: { mediaAssetIds }
    },
    include: { contentVariants: true }
  });

  return {
    contentItem,
    mediaAssets,
    skillOutput: output
  };
}
