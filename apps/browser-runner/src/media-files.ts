import { existsSync } from 'node:fs';

export function pickVideoFile(paths: string[]): string | null {
  const video = paths.find(
    (p) => /\.(mp4|mov|webm|avi)$/i.test(p) && existsSync(p)
  );
  return video ?? null;
}

export function pickImageFiles(paths: string[]): string[] {
  return paths.filter(
    (p) => /\.(png|jpe?g|webp|gif)$/i.test(p) && existsSync(p)
  );
}
