import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decryptToken,
  encryptToken,
  isLocalSecretReference,
  moveTokenToLocalStorage
} from '@ai-growth-ops/providers';

describe('local secret storage', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'ai-growth-ops-secrets-'));
    process.env.LOCAL_DATA_DIR = dataDir;
    process.env.TOKEN_ENCRYPTION_KEY = 'test-local-secret-key';
  });

  afterEach(() => {
    delete process.env.LOCAL_DATA_DIR;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('stores only an opaque reference outside the database value', () => {
    const plaintext = 'sessionid=private-cookie';
    const reference = encryptToken(plaintext);

    expect(isLocalSecretReference(reference)).toBe(true);
    expect(reference).not.toContain(plaintext);
    expect(decryptToken(reference)).toBe(plaintext);

    const id = reference.split(':').at(-1)!;
    const stored = readFileSync(
      join(dataDir, 'secrets', `${id}.secret`),
      'utf8'
    );
    expect(stored).not.toContain(plaintext);
  });

  it('rejects forged local paths', () => {
    expect(() => decryptToken('local-secret:v1:../../etc/passwd')).toThrow(
      'Invalid local secret reference'
    );
  });

  it('migrates an existing inline ciphertext without changing its value', () => {
    delete process.env.LOCAL_DATA_DIR;
    const inline = encryptToken('legacy-secret');
    process.env.LOCAL_DATA_DIR = dataDir;

    const reference = moveTokenToLocalStorage(inline);

    expect(isLocalSecretReference(reference)).toBe(true);
    expect(decryptToken(reference)).toBe('legacy-secret');
    expect(moveTokenToLocalStorage(reference)).toBe(reference);
  });
});
