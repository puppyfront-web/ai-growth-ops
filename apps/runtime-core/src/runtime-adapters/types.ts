export interface SkillRunInput {
  skillId: string;
  payload: Record<string, unknown>;
}

export interface SkillRunResult {
  status: 'success' | 'failed';
  output?: Record<string, unknown>;
  error?: string;
}

export interface RuntimeAdapter {
  name: string;
  runSkill(input: SkillRunInput): Promise<SkillRunResult>;
  checkSkillAvailable(skillId: string): Promise<boolean>;
}
