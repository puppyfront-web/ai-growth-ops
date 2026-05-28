import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';

const tsxBin = './node_modules/.bin/tsx';

describe('runtime core smoke', () => {
  it('lists skills and runs a publish request through the CLI', () => {
    const skills = spawnSync(tsxBin, ['apps/runtime-core/src/entrypoints/cli.ts', 'skills:list'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(skills.stdout).toContain('douyin-upload');

    const publish = spawnSync(
      tsxBin,
      [
        'apps/runtime-core/src/entrypoints/cli.ts',
        'run',
        '--intent=publish',
        '--platforms=douyin',
        '--content=hello',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );
    expect(publish.stdout).toContain('"status":"success"');
  });
});
