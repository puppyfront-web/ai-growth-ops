import {
  createPublishGraph,
  type PublishGraphInput,
  type PublishGraphResult,
} from '../graphs/publish-graph.js';
import { loadRuntimeConfig } from '../config/runtime-config.js';
import { getRuntimeAdapter } from '../runtime-adapters/index.js';
import { buildPublishInvocation, createDefaultPublishRegistry } from '../tools/publish-tools.js';

export async function runPublishWorkflow(input: PublishGraphInput): Promise<PublishGraphResult> {
  const graph = createPublishGraph(async (graphInput) => {
    const registry = await createDefaultPublishRegistry();
    const config = loadRuntimeConfig();
    const results = [];

    for (const platform of graphInput.platforms) {
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
          account: (graphInput as PublishGraphInput & { account?: string }).account,
          title: graphInput.title,
          content: graphInput.content,
          mediaFilePaths: graphInput.mediaFilePaths,
          source: (graphInput as PublishGraphInput & { source?: string }).source,
        },
        config.socialPublishSkillsRoot,
      );

      if (!invocation.executable) {
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
