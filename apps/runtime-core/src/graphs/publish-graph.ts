export interface PublishGraphInput {
  platforms: string[];
  account?: string;
  title?: string;
  content: string;
  mediaFilePaths?: string[];
  source?: string;
}

export interface PublishGraphResultItem {
  platform: string;
  skillId: string;
  status: 'success' | 'failed';
  mode?: 'planned' | 'executed' | 'unresolved';
  detail?: unknown;
}

export interface PublishGraphResult {
  workflow: 'publish';
  status: 'success' | 'failed';
  results: PublishGraphResultItem[];
}

export function createPublishGraph(
  executor: (input: PublishGraphInput) => Promise<PublishGraphResult>
): { run(input: PublishGraphInput): Promise<PublishGraphResult> } {
  return {
    run: executor
  };
}
