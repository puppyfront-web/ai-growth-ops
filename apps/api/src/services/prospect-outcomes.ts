import type { DatabaseClient } from '@ai-growth-ops/database';

/**
 * 潜客转化结果分析（51 号 spec）：评分快照的第一批收割。
 * 回答「哪类评分/画像的潜客真的走向赢单」——调权重从此有据可依。
 * 口径：已转化潜客优先用 conversionSnapshot（转化时刻现场），
 * 历史行/未转化行用当前行值；赢单 = 其客户存在 stage='won' 商机。
 */

export type ProspectOutcomeBucket = {
  key: string;
  candidates: number;
  converted: number;
  won: number;
  wonRate: number | null;
};

export async function getProspectOutcomeAnalytics(
  db: DatabaseClient,
  organizationId: string,
  days: number
) {
  const since = new Date(Date.now() - days * 86_400_000);

  const [candidates, wonDeals] = await Promise.all([
    db.prospectCandidate.findMany({
      where: { organizationId, createdAt: { gte: since } },
      select: {
        id: true,
        leadLevel: true,
        personaTag: true,
        customerId: true,
        metadata: true
      }
    }),
    db.deal.findMany({
      where: { organizationId, stage: 'won' },
      select: { customerId: true }
    })
  ]);
  const wonCustomerIds = new Set(wonDeals.map((deal) => deal.customerId));

  const asRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  const add = (
    map: Map<string, ProspectOutcomeBucket>,
    key: string,
    converted: boolean,
    won: boolean
  ) => {
    const bucket =
      map.get(key) ??
      { key, candidates: 0, converted: 0, won: 0, wonRate: null };
    bucket.candidates += 1;
    if (converted) bucket.converted += 1;
    if (won) bucket.won += 1;
    bucket.wonRate = bucket.converted > 0 ? bucket.won / bucket.converted : null;
    map.set(key, bucket);
  };

  const levelBuckets = new Map<string, ProspectOutcomeBucket>();
  const personaBuckets = new Map<string, ProspectOutcomeBucket>();
  const versionBuckets = new Map<string, number>();
  let convertedTotal = 0;
  let wonTotal = 0;
  let conversionSnapshotTotal = 0;
  let scoringSnapshotTotal = 0;

  for (const candidate of candidates) {
    const meta = asRecord(candidate.metadata);
    const conversionSnapshot = asRecord(meta?.conversionSnapshot);
    const scoring = asRecord(meta?.scoring);

    const converted = Boolean(candidate.customerId);
    const won = converted && wonCustomerIds.has(candidate.customerId as string);

    // 已转化：用转化时刻快照；行值此后被合并演化不影响归因
    const level = String(
      converted
        ? (conversionSnapshot?.leadLevel ?? candidate.leadLevel)
        : candidate.leadLevel
    );
    const persona = String(
      (converted
        ? (conversionSnapshot?.personaTag ?? candidate.personaTag)
        : candidate.personaTag) ?? 'unjudged'
    );

    add(levelBuckets, level, converted, won);
    add(personaBuckets, persona, converted, won);

    if (scoring && typeof scoring.version === 'number') {
      scoringSnapshotTotal += 1;
      const version = `v${scoring.version}`;
      versionBuckets.set(version, (versionBuckets.get(version) ?? 0) + 1);
    }
    if (converted) {
      convertedTotal += 1;
      if (conversionSnapshot) conversionSnapshotTotal += 1;
    }
    if (won) wonTotal += 1;
  }

  const orderLevel = (a: ProspectOutcomeBucket, b: ProspectOutcomeBucket) =>
    (b.converted / Math.max(1, b.candidates)) -
    (a.converted / Math.max(1, a.candidates));

  return {
    range: { days },
    byLevel: [...levelBuckets.values()]
      .sort((a, b) => 'ABCD'.indexOf(a.key) - 'ABCD'.indexOf(b.key))
      .map(({ key, ...rest }) => ({ leadLevel: key, ...rest })),
    byPersona: [...personaBuckets.values()]
      .sort(orderLevel)
      .map(({ key, ...rest }) => ({ personaTag: key, ...rest })),
    byScoringVersion: [...versionBuckets.entries()].map(
      ([version, candidates]) => ({ version, candidates })
    ),
    summary: {
      candidates: candidates.length,
      converted: convertedTotal,
      won: wonTotal,
      wonRate: convertedTotal > 0 ? wonTotal / convertedTotal : null,
      scoringSnapshotCoverage:
        candidates.length > 0 ? scoringSnapshotTotal / candidates.length : null,
      conversionSnapshotCoverage:
        convertedTotal > 0 ? conversionSnapshotTotal / convertedTotal : null
    }
  };
}
