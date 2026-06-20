import { getAllTools, type ToolDefinition } from '@ai-growth-ops/ai-tools';
import type { AgentDefinition, Mutate } from './types.js';

const WRITE_PREFIXES = ['publish.', 'interaction.reply', 'auth.login', 'lead.convert'];

export function inferMutate(toolName: string, agent: AgentDefinition): Mutate {
  if (agent.mutateInference?.[toolName]) return agent.mutateInference[toolName];
  return WRITE_PREFIXES.some((p) => toolName.startsWith(p)) ? 'Write' : 'Read';
}

export function getToolsForAgent(agent: AgentDefinition): ToolDefinition[] {
  const allow = new Set(agent.allowedTools);
  return getAllTools().filter((t) => allow.has(t.name));
}
