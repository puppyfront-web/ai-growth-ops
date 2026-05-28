import type { CapabilityName } from '@ai-growth-ops/capability-schema';

export interface SkillContext {
  platform?: string;
  contentType?: string;
}

export interface SkillManifestRecord {
  skillId: string;
  version?: string;
  runtime: 'openclaw' | 'local_cli' | 'mcp' | 'function_calling' | 'custom';
  entrypoint: string;
  capabilities: CapabilityName[];
  contexts?: SkillContext[];
  enabled: boolean;
  healthy: boolean;
}
