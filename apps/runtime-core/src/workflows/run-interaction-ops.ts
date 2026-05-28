import { BrowserAssistClient } from '@ai-growth-ops/connectors';
import { loadRuntimeConfig } from '../config/runtime-config.js';
import { resolveCookieForPlatform } from '../tools/credential-tools.js';
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
    const account = (graphInput as InteractionOpsInput & { account?: string }).account;
    const cookie = await resolveCookieForPlatform(graphInput.platform, account);
    if (!cookie) {
      return {
        status: 'failed',
        mode: 'blocked',
        reason: 'cookie_not_found',
        items: [],
        replySuggestions: [],
      };
    }

    const config = loadRuntimeConfig();
    const client = new BrowserAssistClient(config.browserRunnerUrl);
    try {
      if (graphInput.interactionType === 'comments') {
        const comments = await client.fetchComments(
          {
            platform: graphInput.platform,
            cookie,
          },
          undefined,
          20,
          undefined,
          false,
        );
        return {
          status: 'success',
          mode: 'executed',
          items: comments.map((item) => ({
            platform: graphInput.platform,
            interactionType: graphInput.interactionType,
            content: item.content,
          })),
          replySuggestions: comments.slice(0, 5).map((item) => buildReplySuggestion(item.content)),
        };
      }

      const messages = await client.fetchMessages(
        {
          platform: graphInput.platform,
          cookie,
        },
        20,
        undefined,
        false,
      );
      return {
        status: 'success',
        mode: 'executed',
        items: messages.map((item) => ({
          platform: graphInput.platform,
          interactionType: graphInput.interactionType,
          content: item.content,
        })),
        replySuggestions: messages.slice(0, 5).map((item) => buildReplySuggestion(item.content)),
      };
    } catch {
      // fall through to deterministic stub below when browser-runner is not available
    }

    const item = {
      platform: graphInput.platform,
      interactionType: graphInput.interactionType,
      content: '想了解合作方式',
    };

    return {
      status: 'success',
      mode: 'fallback',
      reason: 'browser_runner_unavailable',
      items: [item],
      replySuggestions: [buildReplySuggestion(item.content)],
    };
  });

  return graph.run(input);
}
