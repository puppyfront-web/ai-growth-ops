import {
  createLeadMiningGraph,
  type LeadCandidate,
  type LeadMiningResult,
} from '../graphs/lead-mining-graph.js';
import { mapConfidenceToLeadLevel } from '../tools/lead-tools.js';

export async function runLeadMining(input: {
  candidates: LeadCandidate[];
}): Promise<LeadMiningResult> {
  const graph = createLeadMiningGraph(async ({ candidates }) => ({
    status: 'success',
    leads: candidates.map((item) => ({
      platform: item.platform,
      summary: item.content,
      level: mapConfidenceToLeadLevel(item.confidence),
      nextAction: 'follow_up',
    })),
  }));

  return graph.run(input);
}
