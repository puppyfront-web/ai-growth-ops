export interface SkillLifecycleState {
  action: 'install' | 'uninstall' | 'enable' | 'disable' | 'healthcheck';
  source?: string;
  skillId?: string;
  status?: 'success' | 'failed';
}

export interface SkillLifecycleGraph {
  name: 'skill-lifecycle';
  run(input: SkillLifecycleState): Promise<SkillLifecycleState>;
}

export function createSkillLifecycleGraph(
  executor: (input: SkillLifecycleState) => Promise<SkillLifecycleState>,
): SkillLifecycleGraph {
  return {
    name: 'skill-lifecycle',
    run: executor,
  };
}
