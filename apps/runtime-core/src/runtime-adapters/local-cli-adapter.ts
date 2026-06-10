import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type { RuntimeAdapter, SkillRunInput, SkillRunResult } from './types.js';

interface LocalCliPayload {
  root: string;
  cliRelativePath: string;
  command: string[];
}

export class LocalCliAdapter implements RuntimeAdapter {
  name = 'local_cli';

  async runSkill(input: SkillRunInput): Promise<SkillRunResult> {
    const payload = input.payload as unknown as LocalCliPayload;
    const cliPath = join(payload.root, payload.cliRelativePath);
    const result = spawnSync(process.execPath, [cliPath, ...payload.command], {
      cwd: payload.root,
      encoding: 'utf8'
    });

    if (result.status === 0) {
      return {
        status: 'success',
        output: {
          stdout: (result.stdout ?? '').trim(),
          stderr: (result.stderr ?? '').trim()
        }
      };
    }

    return {
      status: 'failed',
      error:
        (result.stderr ?? '').trim() ||
        (result.stdout ?? '').trim() ||
        `exit code ${result.status ?? 1}`,
      output: {
        stdout: (result.stdout ?? '').trim(),
        stderr: (result.stderr ?? '').trim()
      }
    };
  }

  async checkSkillAvailable(skillId: string): Promise<boolean> {
    return Boolean(skillId);
  }
}
