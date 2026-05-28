import { CapabilityRegistry } from '../registry/capability-registry.js';

export function createDefaultPublishRegistry(): CapabilityRegistry {
  return new CapabilityRegistry([
    {
      skillId: 'douyin-upload',
      runtime: 'openclaw',
      entrypoint: 'skills/installed/douyin-upload/SKILL.md',
      capabilities: ['publish.video'],
      contexts: [{ platform: 'douyin' }],
      enabled: true,
      healthy: true,
    },
  ]);
}
