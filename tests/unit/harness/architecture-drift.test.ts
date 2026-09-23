import { describe, expect, it } from 'vitest';
import {
  evaluateArchitectureDrift,
  type DriftRule
} from '../../../scripts/check-architecture-drift';

const rules: DriftRule[] = [
  {
    id: 'forbidden-import',
    severity: 'error',
    filePatterns: [/^packages\/runtime\/src\/.*\.ts$/],
    contentPatterns: [/apps\/api/],
    message: 'runtime cannot depend on the API app'
  },
  {
    id: 'legacy-path',
    severity: 'warn',
    filePatterns: [/^apps\/.*\.ts$/],
    contentPatterns: [/workflow\.execute/],
    message: 'legacy workflow remains'
  }
];

describe('architecture drift evaluation', () => {
  it('separates blocking findings from migration warnings', () => {
    const result = evaluateArchitectureDrift(
      [
        {
          path: 'packages/runtime/src/index.ts',
          content: "import '../../../apps/api/src/server'"
        },
        {
          path: 'apps/worker/src/index.ts',
          content: "const queue = 'workflow.execute'"
        }
      ],
      rules
    );

    expect(result.errors.map((finding) => finding.ruleId)).toEqual([
      'forbidden-import'
    ]);
    expect(result.warnings.map((finding) => finding.ruleId)).toEqual([
      'legacy-path'
    ]);
  });

  it('returns no findings for files outside a rule boundary', () => {
    const result = evaluateArchitectureDrift(
      [{ path: 'apps/web/src/page.ts', content: 'apps/api' }],
      rules
    );
    expect(result).toEqual({ errors: [], warnings: [] });
  });
});
