import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '@ai-growth-ops/database';

const UPLOADS_DIR = join(process.cwd(), 'uploads');

interface GenerateMediaOptions {
  prompt: string;
  style?: string;
  size?: string;
  orgId: string;
  userId: string;
}

export async function generateMediaAsset(
  db: DatabaseClient,
  options: GenerateMediaOptions
) {
  const { prompt, style, size = '1024x1024', orgId, userId } = options;

  // Ensure uploads dir exists
  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

  // Determine which provider to use (matches routes.ts /api/media-assets/generate logic)
  const genMode = process.env.MEDIA_GEN_MODE ?? 'llm_provider';
  const genProvider = process.env.MEDIA_GEN_PROVIDER ?? 'openai';
  let apiKey: string;
  let baseUrl: string;
  let model: string;

  if (genMode === 'dedicated' && process.env.MEDIA_GEN_API_KEY) {
    apiKey = process.env.MEDIA_GEN_API_KEY;
    baseUrl = process.env.MEDIA_GEN_BASE_URL ?? 'https://api.openai.com/v1';
    model = process.env.MEDIA_GEN_MODEL ?? 'dall-e-3';
  } else {
    // Reuse LLM provider config
    apiKey = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
    baseUrl = process.env.AI_BASE_URL ?? 'https://api.openai.com/v1';
    model = process.env.AI_IMAGE_MODEL ?? 'dall-e-3';
  }

  if (!apiKey) throw new Error('AI 服务未配置，请先在设置中配置 API Key');

  // Build full prompt with optional style suffix
  const fullPrompt = style ? `${prompt}, ${style}风格` : prompt;

  // Call image generation API (OpenAI-compatible /v1/images/generations)
  const genResponse = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      prompt: fullPrompt,
      n: 1,
      size,
      response_format: 'b64_json'
    })
  });

  if (!genResponse.ok) {
    const errBody = await genResponse.text();
    console.error('Image generation failed:', genResponse.status, errBody);
    throw new Error('图片生成失败，请检查 AI 配置');
  }

  const genResult = (await genResponse.json()) as Record<string, unknown>;
  const resultData = genResult.data as
    | Array<Record<string, unknown>>
    | undefined;
  const imageData = resultData?.[0];
  if (!imageData) throw new Error('生成结果为空');

  // Save generated image to uploads
  const imageBuffer = imageData.b64_json
    ? Buffer.from(imageData.b64_json as string, 'base64')
    : null;
  const imageUrl = (imageData.url as string) ?? null;

  const savedName = `${randomUUID()}.png`;
  const filePath = join(UPLOADS_DIR, savedName);

  if (imageBuffer) {
    writeFileSync(filePath, imageBuffer);
  } else if (imageUrl) {
    // Download from URL
    const imgResp = await fetch(imageUrl);
    const imgBuf = Buffer.from(await imgResp.arrayBuffer());
    writeFileSync(filePath, imgBuf);
  } else {
    throw new Error('无法获取生成图片');
  }

  // Create a simple hash for dedup
  const promptHash = prompt.trim().slice(0, 64);

  const asset = await db.mediaAsset.create({
    data: {
      organizationId: orgId,
      userId,
      fileName: `ai-generated-${savedName}`,
      fileType: 'image/png',
      fileSize: imageBuffer?.length ?? 0,
      sourceType: 'generated_future',
      sourceUrl: `/uploads/${savedName}`,
      reviewStatus: 'pending_review',
      generationProvider: `${genProvider}/${model}`,
      generationPromptHash: promptHash,
      costEstimate: (genResult.usage as Record<string, number> | undefined)
        ?.total_tokens
        ? (genResult.usage as Record<string, number>).total_tokens * 0.00004
        : 0.04,
      metadata: {
        prompt,
        style,
        size,
        revisedPrompt: (imageData.revised_prompt as string) ?? null
      } as Record<string, unknown>
    }
  });

  return asset;
}
