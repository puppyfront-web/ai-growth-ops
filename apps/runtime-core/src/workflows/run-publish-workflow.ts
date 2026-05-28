import {
  createPublishGraph,
  type PublishGraphInput,
  type PublishGraphResult,
} from '../graphs/publish-graph.js';
import { createDefaultPublishRegistry } from '../tools/publish-tools.js';

export async function runPublishWorkflow(input: PublishGraphInput): Promise<PublishGraphResult> {
  const graph = createPublishGraph(async (graphInput) => {
    const registry = createDefaultPublishRegistry();
    const results = graphInput.platforms.map((platform) => {
      const resolved = registry.resolve('publish.video', { platform });

      return {
        platform,
        skillId: resolved?.skillId ?? 'missing',
        status: resolved ? ('success' as const) : ('failed' as const),
      };
    });

    return {
      workflow: 'publish',
      status: results.every((item) => item.status === 'success') ? 'success' : 'failed',
      results,
    };
  });

  return graph.run(input);
}
