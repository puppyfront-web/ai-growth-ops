export type LeadLevel = 'A' | 'B' | 'C' | 'D';

export interface LevelBreakdown {
  A: number;
  B: number;
  C: number;
  D: number;
}

/** Map a confidence score (0–1) to a lead level. */
export function mapConfidenceToLeadLevel(confidence: number): LeadLevel {
  if (confidence >= 0.8) return 'A';
  if (confidence >= 0.6) return 'B';
  if (confidence >= 0.3) return 'C';
  return 'D';
}

/** Count how many leads fall into each level. */
export function buildLeadBreakdown(
  leads: Array<{ classification: { leadLevel: LeadLevel } }>
): LevelBreakdown {
  const breakdown: LevelBreakdown = { A: 0, B: 0, C: 0, D: 0 };
  for (const lead of leads) {
    breakdown[lead.classification.leadLevel]++;
  }
  return breakdown;
}
