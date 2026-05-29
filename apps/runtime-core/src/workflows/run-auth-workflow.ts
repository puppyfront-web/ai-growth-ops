import { getRuntimeAdapter } from '../runtime-adapters/index.js';
import { createDefaultPublishRegistry } from '../tools/publish-tools.js';
import { resolveSharedAccountForPlatform, validateCookieCredential } from '../tools/credential-tools.js';
import { loadRuntimeConfig } from '../config/runtime-config.js';

export async function runAuthWorkflow(input: {
  action: 'check' | 'login';
  platform: string;
  account?: string;
}) {
  const account = resolveSharedAccountForPlatform(input.platform, input.account);
  const registry = await createDefaultPublishRegistry();
  const capability = input.action === 'check' ? 'auth.check' : 'auth.login';
  const manifest = registry.resolve(capability, { platform: input.platform });

  if (input.action === 'check') {
    const validation = await validateCookieCredential(input.platform, account);
    return {
      workflow: 'auth' as const,
      status: validation.valid ? ('success' as const) : ('failed' as const),
      result: {
        platform: input.platform,
        mode: 'validated',
        detail: {
          valid: validation.valid,
          error: validation.error,
        },
      },
    };
  }

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

  const config = loadRuntimeConfig();
  if (!config.socialPublishSkillsRoot || !account) {
    const required = [];
    if (!account) required.push('account');
    if (!config.socialPublishSkillsRoot) required.push('socialPublishSkillsRoot');

    return {
      workflow: 'auth' as const,
      status: 'success' as const,
      result: {
        platform: input.platform,
        mode: 'planned',
        required,
      },
    };
  }

  const commandPlatform = (manifest.metadata?.commandPlatform as string | undefined) ?? input.platform;
  const subcommand = 'login';
  const adapter = getRuntimeAdapter(manifest.runtime);
  const execution = await adapter.runSkill({
    skillId: manifest.skillId,
    payload: {
      root: config.socialPublishSkillsRoot,
      cliRelativePath: 'dist/cli.js',
      command: [commandPlatform, subcommand, '--account', account],
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
