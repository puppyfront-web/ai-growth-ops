import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertSafeArchiveEntries,
  assertSafeArchiveEntryTypes,
  resolveLocalDataRoot,
  sha256File
} from '../../../scripts/local-data-utils.mjs';

describe('local data operations', () => {
  it('rejects the filesystem root as a local data directory', () => {
    expect(() => resolveLocalDataRoot(parse(process.cwd()).root)).toThrow(
      'LOCAL_DATA_DIR must not be the filesystem root'
    );
  });

  it('accepts only the expected top-level backup directories', () => {
    expect(() =>
      assertSafeArchiveEntries([
        'objects/',
        'objects/image.png',
        'secrets/key.secret'
      ])
    ).not.toThrow();
    expect(() => assertSafeArchiveEntries(['../outside'])).toThrow(
      'Unsafe backup archive entry'
    );
    expect(() => assertSafeArchiveEntries(['/etc/passwd'])).toThrow(
      'Unsafe backup archive entry'
    );
    expect(() => assertSafeArchiveEntries(['postgres/data'])).toThrow(
      'Unsafe backup archive entry'
    );
  });

  it('rejects archive links', () => {
    expect(() =>
      assertSafeArchiveEntryTypes([
        'drwx------  0 user group 0 Jan 1 00:00 uploads/',
        '-rw-------  0 user group 1 Jan 1 00:00 uploads/file'
      ])
    ).not.toThrow();
    expect(() =>
      assertSafeArchiveEntryTypes([
        'lrwxr-xr-x  0 user group 0 Jan 1 00:00 uploads/link -> /etc'
      ])
    ).toThrow('Unsupported backup archive entry type');
  });

  it('calculates a stable SHA-256 checksum', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ai-growth-ops-checksum-'));
    const file = join(directory, 'value.txt');
    writeFileSync(file, 'local-data');

    await expect(sha256File(file)).resolves.toBe(
      '2f833bca7c3eeb69caed4000eb8f5fd44f1d71a153ad65bb696cab326725cfc9'
    );
    rmSync(directory, { recursive: true });
  });
});
