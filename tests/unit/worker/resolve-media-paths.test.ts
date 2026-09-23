import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadResolver = async () =>
  (await import('../../../apps/worker/src/resolve-media-paths')).resolveMediaFilePaths;

describe('resolveMediaFilePaths', () => {
  const originalCwd = process.cwd();
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'media-paths-'));
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.resetModules();
    delete process.env.LOCAL_DATA_DIR;
  });

  async function fakeDb(sourceUrl: string) {
    return {
      mediaAsset: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'asset-1', sourceUrl, deletedAt: null }
        ])
      }
    } as never;
  }

  it('resolves files from the local data uploads directory', async () => {
    mkdirSync(join(root, 'user-data', 'uploads'), { recursive: true });
    process.env.LOCAL_DATA_DIR = realpathSync(join(root, 'user-data'));
    writeFileSync(join(process.env.LOCAL_DATA_DIR, 'uploads', 'a.png'), '');
    const resolveMediaFilePaths = await loadResolver();

    const paths = await resolveMediaFilePaths(
      await fakeDb('/uploads/a.png'),
      ['asset-1']
    );

    expect(paths).toEqual([realpathSync(join(process.env.LOCAL_DATA_DIR, 'uploads', 'a.png'))]);
  });

  it('falls back to the .local-data uploads directory next to the service root', async () => {
    mkdirSync(join(root, '.local-data', 'uploads'), { recursive: true });
    writeFileSync(join(root, '.local-data', 'uploads', 'b.png'), '');
    const resolveMediaFilePaths = await loadResolver();

    const paths = await resolveMediaFilePaths(
      await fakeDb('/uploads/b.png'),
      ['asset-1']
    );

    expect(paths).toEqual([realpathSync(join(root, '.local-data', 'uploads', 'b.png'))]);
  });

  it('keeps legacy uploads directories working', async () => {
    mkdirSync(join(root, 'uploads'), { recursive: true });
    writeFileSync(join(root, 'uploads', 'legacy.png'), '');
    const resolveMediaFilePaths = await loadResolver();

    const paths = await resolveMediaFilePaths(
      await fakeDb('/uploads/legacy.png'),
      ['asset-1']
    );

    expect(paths).toEqual([realpathSync(join(root, 'uploads', 'legacy.png'))]);
  });
});
