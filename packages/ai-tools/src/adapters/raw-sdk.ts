import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolDefinition, ToolExecutionContext } from '../types.js';

/**
 * A tool entry in raw Anthropic/OpenAI tool-calling format.
 * Contains the JSON Schema definition and a bound execute function.
 */
export interface RawToolEntry {
  name: string;
  description: string;
  /** JSON Schema for the tool input */
  inputSchema: Record<string, unknown>;
  /** Execute the tool with validated input */
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Convert a ToolDefinition to a RawToolEntry for use with
 * raw Anthropic/OpenAI tool-calling APIs.
 */
export function toRawTool(
  def: ToolDefinition,
  context: ToolExecutionContext
): RawToolEntry {
  const jsonSchema = zodToJsonSchema(def.inputSchema, {
    target: 'openApi3'
  });
  // Remove $schema which some providers reject
  const { $schema: _, ...schema } = jsonSchema as Record<string, unknown> & {
    $schema?: unknown;
  };

  return {
    name: def.name,
    description: def.description,
    inputSchema: schema as Record<string, unknown>,
    execute: (input) => def.execute(input as never, context)
  };
}

/**
 * Convert an array of ToolDefinitions to RawToolEntry[].
 */
export function toRawTools(
  tools: ToolDefinition[],
  context: ToolExecutionContext
): RawToolEntry[] {
  return tools.map((t) => toRawTool(t, context));
}

/**
 * Convert RawToolEntry[] to Anthropic tool format
 * for use with @anthropic-ai/sdk messages.create({ tools }).
 */
export function toAnthropicTools(
  entries: RawToolEntry[]
): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return entries.map((e) => ({
    name: e.name,
    description: e.description,
    input_schema: e.inputSchema
  }));
}

/**
 * Convert RawToolEntry[] to OpenAI function-calling format
 * for use with openai chat.completions.create({ tools }).
 */
export function toOpenAITools(
  entries: RawToolEntry[]
): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return entries.map((e) => ({
    type: 'function' as const,
    function: {
      name: e.name,
      description: e.description,
      parameters: e.inputSchema
    }
  }));
}

/**
 * Create a tool executor lookup from RawToolEntry[].
 * Used by the agent runner to dispatch tool calls.
 */
export function createToolExecutor(entries: RawToolEntry[]) {
  const map = new Map<string, RawToolEntry>();
  for (const e of entries) {
    map.set(e.name, e);
  }
  return {
    has: (name: string) => map.has(name),
    execute: async (
      name: string,
      input: Record<string, unknown>
    ): Promise<unknown> => {
      const entry = map.get(name);
      if (!entry) throw new Error(`Unknown tool: ${name}`);
      return entry.execute(input);
    }
  };
}
