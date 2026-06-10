import { getSkill, listSkills } from './registry.js';
import type { DefaultSkillRunner } from './runner.js';
import type { ToolSpec, ToolCall, ToolResult } from '@ai-growth-ops/ai';

/**
 * Convert a registered skill into a ToolSpec for use with
 * chatWithTools() or runAgentLoop().
 *
 * The skill's JSON Schema becomes the tool's inputSchema,
 * and the skill runner handles execution.
 */
export function skillToToolSpec(skillName: string): ToolSpec | null {
  const skill = getSkill(skillName);
  if (!skill) return null;

  return {
    name: `skill_${skillName.replace(/-/g, '_')}`,
    description: skill.description,
    inputSchema: skill.inputSchema as Record<string, unknown>
  };
}

/**
 * Convert all registered skills into ToolSpec[].
 */
export function allSkillsToToolSpecs(): ToolSpec[] {
  return listSkills()
    .map((s) => skillToToolSpec(s.name))
    .filter((t): t is ToolSpec => t !== null);
}

/**
 * Create a tool call handler that delegates to the skill runner.
 * For use with chatWithTools({ onToolCall }) and runAgentLoop({ onToolCall }).
 */
export function createSkillToolCallHandler(runner: DefaultSkillRunner) {
  return async (call: ToolCall): Promise<ToolResult> => {
    // Convert skill_xxx_yyy back to xxx-yyy
    const skillName = call.name
      .replace(/^skill_/, '')
      .replace(/_/g, '-');

    const result = await runner.run({
      skillName,
      input: call.arguments
    });

    return {
      toolCallId: call.id,
      output:
        result.status === 'success'
          ? result.output
          : { error: result.error }
    };
  };
}
