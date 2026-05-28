import { CAPABILITIES } from '@ai-growth-ops/capability-schema';
import { loadRuntimeConfig } from '../config/runtime-config.js';
import { CapabilityRegistry } from '../registry/capability-registry.js';
import { discoverSkillManifests } from '../registry/skill-manifest.js';
import type { SkillManifestRecord } from '../registry/types.js';

export async function createDefaultPublishRegistry(): Promise<CapabilityRegistry> {
  const config = loadRuntimeConfig();
  const manifests = await discoverSkillManifests(config.manifestDir);
  return new CapabilityRegistry(manifests);
}

export function buildPublishInvocation(
  manifest: SkillManifestRecord,
  input: {
    platform: string;
    account?: string;
    title?: string;
    content: string;
    mediaFilePaths?: string[];
    source?: string;
  },
  socialPublishSkillsRoot?: string,
): { executable: boolean; payload: Record<string, unknown>; capability: string } {
  const platform = input.platform;
  const commandPlatform = (manifest.metadata?.commandPlatform as string | undefined) ?? platform;
  const executionMode =
    (manifest.metadata?.executionMode as 'local_cli' | 'browser_runner' | undefined) ?? 'local_cli';
  const root = socialPublishSkillsRoot;
  const file = input.mediaFilePaths?.[0];
  const capability = manifest.capabilities[0] ?? CAPABILITIES.PUBLISH_VIDEO;

  if (executionMode === 'browser_runner') {
    return {
      executable: false,
      capability,
      payload: {
        platform,
        commandPlatform,
        reason: 'browser_runner_execution',
      },
    };
  }

  if (!root) {
    return {
      executable: false,
      capability,
      payload: {
        platform,
        reason: 'missing_social_publish_root',
      },
    };
  }

  if (capability === CAPABILITIES.PUBLISH_VIDEO && input.account && file && input.title) {
    return {
      executable: true,
      capability,
      payload: {
        root,
        cliRelativePath: 'dist/cli.js',
        command: [
          commandPlatform,
          'upload',
          '--account',
          input.account,
          '--file',
          file,
          '--title',
          input.title,
        ],
      },
    };
  }

  if (capability === CAPABILITIES.PUBLISH_ARTICLE && input.account && input.source && input.title) {
    return {
      executable: true,
      capability,
      payload: {
        root,
        cliRelativePath: 'dist/cli.js',
        command: [
          commandPlatform,
          'publish',
          '--account',
          input.account,
          '--source',
          input.source,
          '--title',
          input.title,
        ],
      },
    };
  }

  return {
    executable: false,
    capability,
    payload: {
      platform,
      commandPlatform,
      reason: 'insufficient_publish_arguments',
      required:
        capability === CAPABILITIES.PUBLISH_ARTICLE
          ? ['account', 'source', 'title']
          : ['account', 'mediaFilePaths[0]', 'title'],
    },
  };
}
