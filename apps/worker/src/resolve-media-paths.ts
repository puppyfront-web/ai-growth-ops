import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseClient } from '@ai-growth-ops/database';

function uploadsDirs(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const dirs = [
    process.env.UPLOADS_DIR,
    resolve(process.cwd(), 'uploads'),
    resolve(here, '../../../uploads'),
    resolve(here, '../../api/uploads')
  ].filter((dir): dir is string => Boolean(dir));
  return [...new Set(dirs)];
}

export async function resolveMediaFilePaths(
  db: DatabaseClient,
  mediaAssetIds: unknown
): Promise<string[]> {
  if (!Array.isArray(mediaAssetIds) || mediaAssetIds.length === 0) return [];

  const ids = mediaAssetIds.filter(
    (id): id is string => typeof id === 'string'
  );
  if (ids.length === 0) return [];

  const assets = await db.mediaAsset.findMany({
    where: { id: { in: ids }, deletedAt: null }
  });

  const dirs = uploadsDirs();
  const paths: string[] = [];
  for (const asset of assets) {
    if (!asset.sourceUrl?.startsWith('/uploads/')) continue;
    const name = asset.sourceUrl.slice('/uploads/'.length);
    const filePath = dirs
      .map((dir) => resolve(dir, name))
      .find((candidate) => existsSync(candidate));
    if (filePath) paths.push(filePath);
  }
  return paths;
}
