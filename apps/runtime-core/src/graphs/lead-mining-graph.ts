export interface LeadCandidate {
  platform: string;
  content: string;
  confidence: number;
}

export interface LeadMiningResult {
  status: 'success' | 'failed';
  leads: Array<{
    platform: string;
    summary: string;
    level: 'A' | 'B';
    nextAction: string;
  }>;
}

export function createLeadMiningGraph(
  executor: (input: { candidates: LeadCandidate[] }) => Promise<LeadMiningResult>,
): { run(input: { candidates: LeadCandidate[] }): Promise<LeadMiningResult> } {
  return {
    run: executor,
  };
}
