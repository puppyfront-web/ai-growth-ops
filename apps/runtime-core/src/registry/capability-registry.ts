import type { CapabilityName } from '@ai-growth-ops/capability-schema';
import type { SkillContext, SkillManifestRecord } from './types.js';

export class CapabilityRegistry {
  constructor(private readonly skills: SkillManifestRecord[]) {}

  list(): SkillManifestRecord[] {
    return this.skills;
  }

  resolve(
    capability: CapabilityName,
    context: SkillContext
  ): SkillManifestRecord | null {
    return (
      this.skills.find((skill) => {
        if (!skill.enabled || !skill.healthy) return false;
        if (!skill.capabilities.includes(capability)) return false;
        if (!skill.contexts?.length) return true;

        return skill.contexts.some((candidate) => {
          const platformMatches =
            !candidate.platform || candidate.platform === context.platform;
          const contentTypeMatches =
            !candidate.contentType ||
            candidate.contentType === context.contentType;

          return platformMatches && contentTypeMatches;
        });
      }) ?? null
    );
  }
}
