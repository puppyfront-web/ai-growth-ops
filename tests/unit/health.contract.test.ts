import { describe, expect, it } from 'vitest';

import { getApiHealth } from '../../apps/api/src';
import { getBrowserRunnerHealth } from '../../apps/browser-runner/src';
import { getWorkerHealth } from '../../apps/worker/src';

describe('stage-1 app health contracts', () => {
  it('returns healthy metadata for every stage-1 app', () => {
    const healthChecks = [
      getApiHealth(),
      getWorkerHealth(),
      getBrowserRunnerHealth()
    ];

    expect(healthChecks).toHaveLength(3);
    expect(healthChecks.every((item) => item.status === 'ok')).toBe(true);
  });
});
