import { BrowserAssistClient } from '@ai-growth-ops/connectors';
import { loadRuntimeConfig } from '../config/runtime-config.js';
import {
  resolveAuthStateForPlatform,
  resolveSharedAccountForPlatform
} from '../tools/credential-tools.js';
import {
  createInteractionOpsGraph,
  type InteractionOpsInput,
  type InteractionOpsResult
} from '../graphs/interaction-ops-graph.js';

export async function runInteractionOps(
  input: InteractionOpsInput
): Promise<InteractionOpsResult> {
  const graph = createInteractionOpsGraph(async (graphInput) => {
    const requestedAccount = (
      graphInput as InteractionOpsInput & { account?: string }
    ).account;
    const account = resolveSharedAccountForPlatform(
      graphInput.platform,
      requestedAccount
    );
    const cookie = await resolveAuthStateForPlatform(
      graphInput.platform,
      account
    );
    if (!cookie) {
      return {
        status: 'failed',
        mode: 'blocked',
        reason: 'cookie_not_found',
        items: [],
        replySuggestions: []
      };
    }

    const config = loadRuntimeConfig();
    const client = new BrowserAssistClient(config.browserRunnerUrl);
    try {
      if (graphInput.interactionType === 'comments') {
        const comments = await client.fetchComments(
          {
            platform: graphInput.platform,
            cookie
          },
          undefined,
          20,
          undefined,
          false
        );
        return {
          status: 'success',
          mode: 'executed',
          items: comments.map((item: Record<string, unknown>) => ({
            platform: graphInput.platform,
            interactionType: graphInput.interactionType,
            content: String(item.content ?? ''),
            sourceContentTitle: item.sourceContentTitle
              ? String(item.sourceContentTitle)
              : undefined,
            userNickname: item.userNickname
              ? String(item.userNickname)
              : undefined
          })),
          replySuggestions: []
        };
      }

      const messages = await client.fetchMessages(
        {
          platform: graphInput.platform,
          cookie
        },
        20,
        undefined,
        false
      );
      return {
        status: 'success',
        mode: 'executed',
        items: messages.map((item: Record<string, unknown>) => ({
          platform: graphInput.platform,
          interactionType: graphInput.interactionType,
          content: String(item.content ?? ''),
          sourceContentTitle: item.sourceContentTitle
            ? String(item.sourceContentTitle)
            : undefined,
          userNickname: item.userNickname
            ? String(item.userNickname)
            : undefined
        })),
        replySuggestions: []
      };
    } catch (error) {
      console.error('[interaction-ops] browser-runner fetch failed:', error);
      return {
        status: 'failed',
        mode: 'blocked',
        reason: error instanceof Error ? error.message : 'browser_runner_error',
        items: [],
        replySuggestions: []
      };
    }
  });

  return graph.run(input);
}
