export function mapConfidenceToLeadLevel(confidence: number): 'A' | 'B' {
  return confidence >= 0.9 ? 'A' : 'B';
}
