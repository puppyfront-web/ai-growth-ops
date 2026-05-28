import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseClient } from '@ai-growth-ops/database';

function uploadsDir(): string {
  if (process.env.UPLOADS_DIR) return process.env.UPLOADS_DIR;
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../api/uploads');
}

export async function resolveMediaFilePaths(
  db: DatabaseClient,
  mediaAssetIds: unknown,
): Promise<string[]> {
  if (!Array.isArray(mediaAssetIds) || mediaAssetIds.length === 0) return [];

  const ids = mediaAssetIds.filter((id): id is string => typeof id === 'string');
  if (ids.length === 0) return [];

  const assets = await db.mediaAsset.findMany({
    where: { id: { in: ids }, deletedAt: null },
  });

  const dir = uploadsDir();
  const paths: string[] = [];
  for (const asset of assets) {
    if (!asset.sourceUrl?.startsWith('/uploads/')) continue;
    const filePath = resolve(dir, asset.sourceUrl.slice('/uploads/'.length));
    if (existsSync(filePath)) paths.push(filePath);
  }
  return paths;
}
