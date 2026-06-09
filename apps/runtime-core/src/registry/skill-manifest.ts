import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { SkillManifestRecord } from './types.js';

export async function loadSkillManifest(
  path: string
): Promise<SkillManifestRecord> {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as SkillManifestRecord;
}

export async function discoverSkillManifests(
  dir: string
): Promise<SkillManifestRecord[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries.filter(
    (entry) => entry.isFile() && entry.name.endsWith('.json')
  );
  const manifests = await Promise.all(
    files.map((file) => loadSkillManifest(join(dir, file.name)))
  );
  return manifests;
}
