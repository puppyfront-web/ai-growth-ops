export interface InteractionOpsInput {
  platform: 'douyin' | 'xiaohongshu';
  interactionType: 'comments' | 'messages';
  account?: string;
}

export interface InteractionOpsResult {
  status: 'success' | 'failed';
  mode?: 'executed' | 'fallback' | 'blocked';
  reason?: string;
  items: Array<{
    platform: string;
    interactionType: string;
    content: string;
    sourceContentTitle?: string;
    userNickname?: string;
  }>;
  replySuggestions: Array<{
    text: string;
    confidence: number;
  }>;
}

export function createInteractionOpsGraph(
  executor: (input: InteractionOpsInput) => Promise<InteractionOpsResult>,
): { run(input: InteractionOpsInput): Promise<InteractionOpsResult> } {
  return {
    run: executor,
  };
}
