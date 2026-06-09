import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function saveRunArtifact(
  path: string,
  data: unknown
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}
