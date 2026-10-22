import { describe, expect, it } from 'vitest';
import {
  hashBucket,
  pickVariant,
  summarizeExperiment,
  type ExperimentVariant
} from '../../../packages/shared/src/experiment';

const variants: ExperimentVariant[] = [
  { key: 'a', name: 'A 对照', weight: 50 },
  { key: 'b', name: 'B 实验', weight: 50 }
];

describe('hashBucket', () => {
  it('is deterministic and stays in 0..99', () => {
    const first = hashBucket('exp-1:content:1');
    expect(hashBucket('exp-1:content:1')).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(100);
  });
});

describe('pickVariant', () => {
  it('maps bucket ranges to weights', () => {
    expect(pickVariant(variants, 0).key).toBe('a');
    expect(pickVariant(variants, 49).key).toBe('a');
    expect(pickVariant(variants, 50).key).toBe('b');
    expect(pickVariant(variants, 99).key).toBe('b');
  });

  it('falls back to equal weights when weights are invalid', () => {
    const zero: ExperimentVariant[] = [
      { key: 'a', name: 'A', weight: 0 },
      { key: 'b', name: 'B', weight: 0 }
    ];
    expect(pickVariant(zero, 0).key).toBe('a');
    expect(pickVariant(zero, 99).key).toBe('b');
  });
});

describe('summarizeExperiment', () => {
  it('computes conversion rate and significance against control', () => {
    const result = summarizeExperiment(
      variants,
      { a: 100, b: 100 },
      { a: 10, b: 20 }
    );

    const control = result.rows.find((row) => row.key === 'a')!;
    const experiment = result.rows.find((row) => row.key === 'b')!;
    expect(control.rate).toBe(0.1);
    expect(experiment.rate).toBe(0.2);
    expect(experiment.lift).toBe(1);
    expect(experiment.pValue).toBeLessThan(0.05);
    expect(result.significant).toBe(true);
    expect(result.winnerKey).toBe('b');
  });

  it('does not declare a winner without enough data', () => {
    const result = summarizeExperiment(
      variants,
      { a: 5, b: 5 },
      { a: 1, b: 4 }
    );
    expect(result.winnerKey).toBeNull();
    expect(result.significant).toBe(false);
  });

  it('handles empty variants and assignments', () => {
    const result = summarizeExperiment([], {}, {});
    expect(result.rows).toEqual([]);
    expect(result.winnerKey).toBeNull();
    expect(result.significant).toBe(false);
  });
});
