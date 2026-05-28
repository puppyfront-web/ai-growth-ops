import { createSkillLifecycleGraph, type SkillLifecycleState } from '../graphs/skill-lifecycle-graph.js';
import { installSkillFromSource } from '../tools/registry-tools.js';

export async function runSkillLifecycle(input: {
  action: 'install' | 'uninstall' | 'enable' | 'disable' | 'healthcheck';
  source?: string;
  skillId?: string;
}) {
  const graph = createSkillLifecycleGraph(async (state: SkillLifecycleState) => {
    if (state.action === 'install' && state.source) {
      const skill = await installSkillFromSource(state.source);
      return {
        ...state,
        skillId: skill.skillId,
        status: 'success',
      };
    }

    return {
      ...state,
      status: 'failed',
    };
  });

  const result = await graph.run(input);
  return {
    status: result.status ?? 'failed',
    skillId: result.skillId ?? input.skillId ?? 'unknown',
  };
}
