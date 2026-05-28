export interface PublishGraphInput {
  platforms: string[];
  title?: string;
  content: string;
  mediaFilePaths?: string[];
}

export interface PublishGraphResultItem {
  platform: string;
  skillId: string;
  status: 'success' | 'failed';
}

export interface PublishGraphResult {
  workflow: 'publish';
  status: 'success' | 'failed';
  results: PublishGraphResultItem[];
}

export function createPublishGraph(
  executor: (input: PublishGraphInput) => Promise<PublishGraphResult>,
): { run(input: PublishGraphInput): Promise<PublishGraphResult> } {
  return {
    run: executor,
  };
}
