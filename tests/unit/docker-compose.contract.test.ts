import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('docker compose contract', () => {
  it('defines postgres, redis, and minio services', () => {
    const composeFile = readFileSync('docker-compose.yml', 'utf8');

    expect(composeFile).toContain('postgres:');
    expect(composeFile).toContain('redis:');
    expect(composeFile).toContain('minio:');
  });
});
