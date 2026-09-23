import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { parse, resolve } from 'node:path';

const BACKUP_DIRECTORIES = new Set(['objects', 'secrets', 'uploads']);

export function resolveLocalDataRoot(value, cwd = process.cwd()) {
  const root = resolve(cwd, value?.trim() || '.local-data');
  if (root === parse(root).root) {
    throw new Error('LOCAL_DATA_DIR must not be the filesystem root');
  }
  return root;
}

export function assertSafeArchiveEntries(entries) {
  for (const original of entries) {
    const entry = original.replace(/^\.\//, '').replace(/\/$/, '');
    const segments = entry.split('/');
    if (
      !entry ||
      original.startsWith('/') ||
      original.includes('\\') ||
      segments.includes('..') ||
      !BACKUP_DIRECTORIES.has(segments[0])
    ) {
      throw new Error(`Unsafe backup archive entry: ${original}`);
    }
  }
}

export function assertSafeArchiveEntryTypes(entries) {
  for (const entry of entries) {
    if (entry && entry[0] !== '-' && entry[0] !== 'd') {
      throw new Error(`Unsupported backup archive entry type: ${entry[0]}`);
    }
  }
}

export async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
