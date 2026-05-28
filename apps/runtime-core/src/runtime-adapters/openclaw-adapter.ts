import type { RuntimeAdapter, SkillRunInput, SkillRunResult } from './types.js';

export class OpenClawAdapter implements RuntimeAdapter {
  name = 'openclaw';

  async runSkill(input: SkillRunInput): Promise<SkillRunResult> {
    return {
      status: 'success',
      output: {
        skillId: input.skillId,
        accepted: true,
      },
    };
  }

  async checkSkillAvailable(_skillId: string): Promise<boolean> {
    return true;
  }
}
