import { afterEach, describe, expect, it } from 'vitest';

import { localDataPath } from '../../../apps/api/src/local-paths';

const originalLocalDataDir = process.env.LOCAL_DATA_DIR;

afterEach(() => {
  if (originalLocalDataDir === undefined) delete process.env.LOCAL_DATA_DIR;
  else process.env.LOCAL_DATA_DIR = originalLocalDataDir;
});

describe('localDataPath', () => {
  it('places uploads beneath the configured local data directory', () => {
    process.env.LOCAL_DATA_DIR = '/tmp/ai-growth-ops-user';

    expect(localDataPath('uploads')).toBe('/tmp/ai-growth-ops-user/uploads');
  });

  it('rejects paths that can escape the local data directory', () => {
    process.env.LOCAL_DATA_DIR = '/tmp/ai-growth-ops-user';

    expect(() => localDataPath('../outside')).toThrow(
      'Invalid local data path'
    );
  });
});
