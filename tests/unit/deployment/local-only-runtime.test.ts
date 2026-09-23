import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const compose = readFileSync('docker-compose.prod.yml', 'utf8');
const environment = readFileSync('.env.example', 'utf8');
const rootPackage = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};

describe('local-only runtime boundary', () => {
  it('binds every persistent service to the user data directory', () => {
    expect(compose).toContain(
      '${LOCAL_DATA_DIR:?Set LOCAL_DATA_DIR}/postgres:/var/lib/postgresql/data'
    );
    expect(compose).toContain(
      '${LOCAL_DATA_DIR:?Set LOCAL_DATA_DIR}/redis:/data'
    );
    expect(compose).toContain(
      '${LOCAL_DATA_DIR:?Set LOCAL_DATA_DIR}/objects:/data'
    );
    expect(compose).toContain(
      '${LOCAL_DATA_DIR:?Set LOCAL_DATA_DIR}:/var/lib/ai-growth-ops'
    );
  });

  it('does not configure a cloud control-plane database', () => {
    expect(environment).not.toContain('CONTROL_DATABASE_URL');
    expect(rootPackage.scripts).not.toHaveProperty('control:deploy');
    expect(rootPackage.scripts).not.toHaveProperty('control:generate');
  });

  it('provides local preparation, backup, and restore commands', () => {
    expect(rootPackage.scripts).toHaveProperty('local:prepare');
    expect(rootPackage.scripts).toHaveProperty('local:backup');
    expect(rootPackage.scripts).toHaveProperty('local:restore');
  });

  it('keeps all externally reachable services on loopback', () => {
    expect(compose).toContain("'127.0.0.1:${API_PORT:-3100}:3100'");
    expect(compose).toContain("'127.0.0.1:${WEB_PORT:-3000}:3000'");
    expect(compose).not.toMatch(/\n\s+- ['"]?\$\{POSTGRES_PORT/);
    expect(compose).not.toMatch(/\n\s+- ['"]?\$\{MINIO_API_PORT/);
  });
});
