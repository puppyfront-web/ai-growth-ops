import { tool } from 'ai';
import type { ToolDefinition, ToolExecutionContext } from '../types.js';

/**
 * Convert a single ToolDefinition to a Vercel AI SDK tool.
 * The execute function is bound to the provided context.
 *
 * Uses a type assertion because Vercel AI SDK's `tool()` return type
 * is invariant over its schema generic, but our ToolDefinition uses
 * a generic-free Zod schema. The runtime behavior is correct.
 */
export function toVercelTool(
  def: ToolDefinition,
  context: ToolExecutionContext
) {
  return tool({
    description: def.description,
    inputSchema: def.inputSchema,
    execute: async (input: unknown) => def.execute(input, context)
  });
}

/**
 * Convert an array of ToolDefinitions to the Record<string, Tool> format
 * expected by Vercel AI SDK's streamText({ tools }).
 */
export function toVercelTools(
  tools: ToolDefinition[],
  context: ToolExecutionContext
) {
  const result: Record<string, ReturnType<typeof toVercelTool>> = {};
  for (const t of tools) {
    result[t.name] = toVercelTool(t, context);
  }
  return result;
}
