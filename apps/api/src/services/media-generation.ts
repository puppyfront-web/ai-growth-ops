import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '@ai-growth-ops/database';
import {
  credentialsFromSaved,
  generationEndpoint,
  pickGeneratedMediaUrl,
  type MediaGenKind
} from './media-gen-config.js';

const UPLOADS_DIR = join(process.cwd(), 'uploads');

export interface GenerateMediaOptions {
  prompt: string;
  style?: string;
  size?: string;
  orgId: string;
  userId: string;
  generationType?: MediaGenKind | string;
}

export async function loadAiConfigValue(
  db: DatabaseClient,
  userId: string
): Promise<Record<string, unknown> | null> {
  const savedConfig = await db.appConfig.findUnique({
    where: { userId_key: { userId, key: 'ai_config' } }
  });
  return (savedConfig?.value as Record<string, unknown> | null) ?? null;
}

function resolveKind(generationType?: string): MediaGenKind {
  return generationType === 'video' ? 'video' : 'image';
}

async function persistGeneratedFile(params: {
  url?: string;
  b64?: string;
  kind: MediaGenKind;
}): Promise<{ savedName: string; fileSize: number; fileType: string }> {
  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
  const ext = params.kind === 'video' ? '.mp4' : '.png';
  const fileType = params.kind === 'video' ? 'video/mp4' : 'image/png';
  const savedName = `${randomUUID()}${ext}`;
  const filePath = join(UPLOADS_DIR, savedName);

  if (params.b64) {
    const buffer = Buffer.from(params.b64, 'base64');
    writeFileSync(filePath, buffer);
    return { savedName, fileSize: buffer.length, fileType };
  }
  if (!params.url) {
    throw new Error(params.kind === 'video' ? '无法获取生成视频' : '无法获取生成图片');
  }
  const remote = await fetch(params.url, { signal: AbortSignal.timeout(120_000) });
  if (!remote.ok) {
    throw new Error(params.kind === 'video' ? '下载生成视频失败' : '下载生成图片失败');
  }
  const buffer = Buffer.from(await remote.arrayBuffer());
  writeFileSync(filePath, buffer);
  return { savedName, fileSize: buffer.length, fileType };
}

export async function generateMediaAsset(
  db: DatabaseClient,
  options: GenerateMediaOptions
) {
  const {
    prompt,
    style,
    size = '1024x1024',
    orgId,
    userId,
    generationType
  } = options;
  const kind = resolveKind(generationType);
  const saved = await loadAiConfigValue(db, userId);
  const creds = credentialsFromSaved(saved, kind);

  if (!creds.apiKey || /CHANGE_ME/i.test(creds.apiKey)) {
    throw new Error(
      kind === 'video'
        ? '视频生成 API 未配置，请先在系统设置 → AI 配置中填写'
        : '图片生成 API 未配置，请先在系统设置 → AI 配置中填写'
    );
  }
  if (!creds.baseUrl) {
    throw new Error(
      kind === 'video'
        ? '视频生成 Base URL 未配置，请先在系统设置 → AI 配置中填写'
        : '图片生成 Base URL 未配置，请先在系统设置 → AI 配置中填写'
    );
  }

  const fullPrompt = style ? `${prompt}, ${style}风格` : prompt;
  const endpoint = generationEndpoint(creds.baseUrl, kind);
  const payload =
    kind === 'video'
      ? { model: creds.model, prompt: fullPrompt }
      : {
          model: creds.model,
          prompt: fullPrompt,
          n: 1,
          size,
          response_format: 'b64_json'
        };

  let genResponse: Response;
  try {
    genResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.apiKey}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(kind === 'video' ? 120_000 : 45_000)
    });
  } catch {
    throw new Error(
      kind === 'video'
        ? '无法连接视频生成接口，请检查 Base URL'
        : '无法连接图片生成接口，请检查 Base URL'
    );
  }

  if (!genResponse.ok) {
    const errBody = await genResponse.text();
    console.error(`${kind} generation failed:`, genResponse.status, errBody);
    throw new Error(
      kind === 'video'
        ? '视频生成失败，请检查视频 API 配置'
        : '图片生成失败，请检查图片 API 配置'
    );
  }

  const genResult = (await genResponse.json()) as Record<string, unknown>;
  const picked = pickGeneratedMediaUrl(genResult);
  if (!picked.url && !picked.b64) {
    throw new Error(
      kind === 'video'
        ? '该视频接口未返回可下载地址，当前仅支持同步返回视频 URL 的接口'
        : '生成结果为空'
    );
  }

  const stored = await persistGeneratedFile({ ...picked, kind });
  const promptHash = prompt.trim().slice(0, 64);

  return db.mediaAsset.create({
    data: {
      organizationId: orgId,
      userId,
      fileName: `ai-generated-${stored.savedName}`,
      fileType: stored.fileType,
      fileSize: stored.fileSize,
      sourceType: 'generated_future',
      sourceUrl: `/uploads/${stored.savedName}`,
      reviewStatus: 'pending_review',
      generationProvider: `${creds.provider}/${creds.model}`,
      generationPromptHash: promptHash,
      costEstimate: (genResult.usage as Record<string, number> | undefined)
        ?.total_tokens
        ? (genResult.usage as Record<string, number>).total_tokens * 0.00004
        : kind === 'video'
          ? 0.2
          : 0.04,
      metadata: {
        prompt,
        style,
        size,
        generationType: kind
      } as never
    }
  });
}
