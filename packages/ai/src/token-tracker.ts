export interface TokenUsageRecord {
  skillName: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  timestamp: Date;
}

const records: TokenUsageRecord[] = [];

export function trackTokenUsage(record: TokenUsageRecord): void {
  records.push(record);
}

export function getTokenUsageRecords(): TokenUsageRecord[] {
  return [...records];
}

export function getTokenUsageSummary(): {
  totalTokens: number;
  totalCost: number;
  bySkill: Record<string, number>;
} {
  let totalTokens = 0;
  const bySkill: Record<string, number> = {};
  for (const r of records) {
    totalTokens += r.totalTokens;
    bySkill[r.skillName] = (bySkill[r.skillName] || 0) + r.totalTokens;
  }
  // Rough cost estimate: $0.003 per 1K tokens for Sonnet
  return { totalTokens, totalCost: totalTokens * 0.000003, bySkill };
}

export function clearTokenUsage(): void {
  records.length = 0;
}
