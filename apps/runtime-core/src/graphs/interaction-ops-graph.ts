export interface InteractionOpsInput {
  platform: 'douyin' | 'xiaohongshu';
  interactionType: 'comments' | 'messages';
}

export interface InteractionOpsResult {
  status: 'success' | 'failed';
  items: Array<{
    platform: string;
    interactionType: string;
    content: string;
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
