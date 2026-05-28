import {
  createInteractionOpsGraph,
  type InteractionOpsInput,
  type InteractionOpsResult,
} from '../graphs/interaction-ops-graph.js';
import { buildReplySuggestion } from '../tools/interaction-tools.js';

export async function runInteractionOps(
  input: InteractionOpsInput,
): Promise<InteractionOpsResult> {
  const graph = createInteractionOpsGraph(async (graphInput) => {
    const item = {
      platform: graphInput.platform,
      interactionType: graphInput.interactionType,
      content: '想了解合作方式',
    };

    return {
      status: 'success',
      items: [item],
      replySuggestions: [buildReplySuggestion(item.content)],
    };
  });

  return graph.run(input);
}
