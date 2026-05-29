import {
  createPublishGraph,
  type PublishGraphInput,
  type PublishGraphResult,
} from '../graphs/publish-graph.js';
import { loadRuntimeConfig } from '../config/runtime-config.js';
import { getRuntimeAdapter } from '../runtime-adapters/index.js';
import { resolveCookieForPlatform } from '../tools/credential-tools.js';
import { publishViaBrowserRunner } from '../tools/browser-runner-tools.js';
import { buildPublishInvocation, createDefaultPublishRegistry } from '../tools/publish-tools.js';

export async function runPublishWorkflow(input: PublishGraphInput): Promise<PublishGraphResult> {
  const graph = createPublishGraph(async (graphInput) => {
    const registry = await createDefaultPublishRegistry();
    const config = loadRuntimeConfig();
    const results = [];

    for (const platform of graphInput.platforms) {
      const account = (graphInput as PublishGraphInput & { account?: string }).account;
      const source = (graphInput as PublishGraphInput & { source?: string }).source;
      const resolved =
        registry.resolve('publish.video', { platform }) ??
        registry.resolve('publish.article', { platform }) ??
        registry.resolve('publish.note', { platform });

      if (!resolved) {
        results.push({
          platform,
          skillId: 'missing',
          status: 'failed' as const,
          mode: 'unresolved',
        });
        continue;
      }

      const invocation = buildPublishInvocation(
        resolved,
        {
          platform,
          account,
          title: graphInput.title,
          content: graphInput.content,
          mediaFilePaths: graphInput.mediaFilePaths,
          source,
        },
        config.socialPublishSkillsRoot,
      );

      if (!invocation.executable) {
        const cookie = await resolveCookieForPlatform(platform, account);
        if (cookie && ['xiaohongshu', 'wechat_official', 'wechat_channels', 'baijiahao', 'zhihu'].includes(platform)) {
          try {
            const execution = await publishViaBrowserRunner({
              platform,
              cookie,
              title: graphInput.title,
              content: graphInput.content,
              mediaFilePaths: graphInput.mediaFilePaths,
              source,
            });
            results.push({
              platform,
              skillId: resolved.skillId,
              status: execution.status,
              mode: 'executed',
              detail: execution.detail,
            });
            continue;
          } catch (error) {
            results.push({
              platform,
              skillId: resolved.skillId,
              status: 'failed' as const,
              mode: 'executed',
              detail: error instanceof Error ? error.message : 'browser_runner_publish_failed',
            });
            continue;
          }
        }

        if (
          invocation.payload &&
          typeof invocation.payload === 'object' &&
          'reason' in invocation.payload &&
          invocation.payload.reason === 'browser_runner_execution'
        ) {
          results.push({
            platform,
            skillId: resolved.skillId,
            status: 'failed' as const,
            mode: 'planned',
            detail: {
              ...invocation.payload,
              missing: ['cookie'],
            },
          });
          continue;
        }

        results.push({
          platform,
          skillId: resolved.skillId,
          status: 'success' as const,
          mode: 'planned',
          detail: invocation.payload,
        });
        continue;
      }

      const adapter = getRuntimeAdapter(resolved.runtime);
      const execution = await adapter.runSkill({
        skillId: resolved.skillId,
        payload: invocation.payload,
      });

      results.push({
        platform,
        skillId: resolved.skillId,
        status: execution.status,
        mode: 'executed',
        detail: execution.output ?? execution.error,
      });
    }

    return {
      workflow: 'publish',
      status: results.every((item) => item.status === 'success') ? 'success' : 'failed',
      results: results as PublishGraphResult['results'],
    };
  });

  return graph.run(input);
}
