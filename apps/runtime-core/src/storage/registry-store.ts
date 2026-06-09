import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SkillManifestRecord } from '../registry/types.js';

export async function loadRegistryStore(
  path: string
): Promise<SkillManifestRecord[]> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as SkillManifestRecord[];
  } catch {
    return [];
  }
}

export async function saveRegistryStore(
  path: string,
  records: SkillManifestRecord[]
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(records, null, 2));
}
