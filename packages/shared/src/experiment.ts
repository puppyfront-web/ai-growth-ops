/**
 * Deterministic experiment assignment + two-proportion significance test.
 * The implementation is intentionally conservative: a winner needs at least
 * 30 assignments per variant and p < 0.05 against the first variant.
 */

export type ExperimentVariant = {
  key: string;
  name: string;
  weight: number;
};

export type ExperimentRow = {
  key: string;
  name: string;
  assignments: number;
  conversions: number;
  rate: number;
  lift: number;
  pValue: number;
};

export type ExperimentSummary = {
  rows: ExperimentRow[];
  significant: boolean;
  winnerKey: string | null;
};

const MIN_ASSIGNMENTS = 30;

export function hashBucket(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function pickVariant(
  variants: ExperimentVariant[],
  bucket: number
): ExperimentVariant {
  if (variants.length === 0) {
    throw new Error('实验至少需要一个变体');
  }
  const weights = variants.map((variant) =>
    Number.isFinite(variant.weight) && variant.weight > 0 ? variant.weight : 0
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const normalized =
    total > 0
      ? weights.map((weight) => (weight / total) * 100)
      : variants.map(() => 100 / variants.length);
  const target = Math.min(99.999, Math.max(0, bucket));
  let cursor = 0;
  for (let index = 0; index < variants.length; index += 1) {
    cursor += normalized[index] ?? 0;
    if (target < cursor) return variants[index]!;
  }
  return variants[variants.length - 1]!;
}

function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y =
    1 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-x * x);
  return sign * y;
}

function normalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function twoProportionPValue(
  controlConversions: number,
  controlAssignments: number,
  variantConversions: number,
  variantAssignments: number
): number {
  if (controlAssignments <= 0 || variantAssignments <= 0) return 1;
  const pooled =
    (controlConversions + variantConversions) /
    (controlAssignments + variantAssignments);
  if (pooled <= 0 || pooled >= 1) return 1;
  const standardError = Math.sqrt(
    pooled *
      (1 - pooled) *
      (1 / controlAssignments + 1 / variantAssignments)
  );
  if (standardError === 0) return 1;
  const z =
    (variantConversions / variantAssignments -
      controlConversions / controlAssignments) /
    standardError;
  return Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
}

function rate(conversions: number, assignments: number): number {
  if (assignments <= 0) return 0;
  return conversions / assignments;
}

export function summarizeExperiment(
  variants: ExperimentVariant[],
  assignments: Record<string, number>,
  conversions: Record<string, number>
): ExperimentSummary {
  const controlKey = variants[0]?.key;
  const controlAssignments = controlKey ? assignments[controlKey] ?? 0 : 0;
  const controlConversions = controlKey ? conversions[controlKey] ?? 0 : 0;
  const controlRate = rate(controlConversions, controlAssignments);

  const rows = variants.map((variant) => {
    const variantAssignments = assignments[variant.key] ?? 0;
    const variantConversions = conversions[variant.key] ?? 0;
    const variantRate = rate(variantConversions, variantAssignments);
    return {
      key: variant.key,
      name: variant.name,
      assignments: variantAssignments,
      conversions: variantConversions,
      rate: variantRate,
      lift:
        controlRate > 0 ? (variantRate - controlRate) / controlRate : 0,
      pValue:
        variant.key === controlKey
          ? 1
          : twoProportionPValue(
              controlConversions,
              controlAssignments,
              variantConversions,
              variantAssignments
            )
    };
  });

  const candidates = rows.filter(
    (row) =>
      row.key !== controlKey &&
      row.assignments >= MIN_ASSIGNMENTS &&
      row.pValue < 0.05 &&
      row.rate > controlRate
  );
  const winner = candidates.sort(
    (a, b) => b.rate - a.rate || a.pValue - b.pValue
  )[0];

  return {
    rows,
    significant: Boolean(winner),
    winnerKey: winner?.key ?? null
  };
}
