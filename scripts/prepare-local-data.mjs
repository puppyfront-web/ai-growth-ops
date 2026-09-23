import { chmodSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveLocalDataRoot } from './local-data-utils.mjs';

const root = resolveLocalDataRoot(process.env.LOCAL_DATA_DIR);
const directories = [
  'postgres',
  'redis',
  'objects',
  'secrets',
  'uploads',
  'backups'
];

mkdirSync(root, { recursive: true, mode: 0o700 });
chmodSync(root, 0o700);

for (const directory of directories) {
  const path = resolve(root, directory);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
}

console.log(`Local data directory prepared: ${root}`);
