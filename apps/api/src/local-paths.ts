import { resolve, sep } from 'node:path';

function localDataRoot(): string {
  return resolve(process.env.LOCAL_DATA_DIR?.trim() || '.local-data');
}

export function localDataPath(name: string): string {
  const root = localDataRoot();
  const path = resolve(root, name);
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new Error('Invalid local data path');
  }
  return path;
}
