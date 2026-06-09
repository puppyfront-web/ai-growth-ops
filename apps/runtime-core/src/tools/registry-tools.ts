import { loadSkillManifest } from '../registry/skill-manifest.js';
import type { SkillManifestRecord } from '../registry/types.js';

export async function installSkillFromSource(
  source: string
): Promise<SkillManifestRecord> {
  return loadSkillManifest(source);
}

export async function markSkillEnabled(
  skill: SkillManifestRecord,
  enabled: boolean
): Promise<SkillManifestRecord> {
  return {
    ...skill,
    enabled
  };
}
