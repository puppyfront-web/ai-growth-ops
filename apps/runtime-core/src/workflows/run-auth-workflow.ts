import { loadRuntimeConfig } from '../config/runtime-config.js';
import { getRuntimeAdapter } from '../runtime-adapters/index.js';
import { createDefaultPublishRegistry } from '../tools/publish-tools.js';

export async function runAuthWorkflow(input: {
  action: 'check' | 'login';
  platform: string;
  account?: string;
}) {
  const registry = await createDefaultPublishRegistry();
  const config = loadRuntimeConfig();
  const capability = input.action === 'check' ? 'auth.check' : 'auth.login';
  const manifest = registry.resolve(capability, { platform: input.platform });

  if (!manifest) {
    return {
      workflow: 'auth' as const,
      status: 'failed' as const,
      result: {
        platform: input.platform,
        reason: 'capability_unresolved',
      },
    };
  }

  if (!config.socialPublishSkillsRoot || !input.account) {
    return {
      workflow: 'auth' as const,
      status: 'success' as const,
      result: {
        platform: input.platform,
        mode: 'planned',
        required: ['account', 'socialPublishSkillsRoot'],
      },
    };
  }

  const commandPlatform = (manifest.metadata?.commandPlatform as string | undefined) ?? input.platform;
  const subcommand = input.action === 'check' ? 'check' : 'login';
  const adapter = getRuntimeAdapter(manifest.runtime);
  const execution = await adapter.runSkill({
    skillId: manifest.skillId,
    payload: {
      root: config.socialPublishSkillsRoot,
      cliRelativePath: 'dist/cli.js',
      command: [commandPlatform, subcommand, '--account', input.account],
    },
  });

  return {
    workflow: 'auth' as const,
    status: execution.status,
    result: {
      platform: input.platform,
      mode: 'executed',
      detail: execution.output ?? execution.error,
    },
  };
}
