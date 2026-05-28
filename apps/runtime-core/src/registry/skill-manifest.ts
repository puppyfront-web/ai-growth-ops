import { readFile } from 'node:fs/promises';
import type { SkillManifestRecord } from './types.js';

export async function loadSkillManifest(path: string): Promise<SkillManifestRecord> {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as SkillManifestRecord;
}
