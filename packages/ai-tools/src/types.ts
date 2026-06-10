import type { z } from 'zod';

// ── Tool Definition ────────────────────────────────────────────

/**
 * Provider-agnostic tool definition.
 * This is the canonical shape of a tool in the system.
 * Adapters convert this to Vercel AI SDK or raw Anthropic/OpenAI format.
 */
export interface ToolDefinition<TOutput = unknown> {
  /** Unique tool name, snake_case (e.g., 'write_content') */
  name: string;
  /** Human-readable description for the LLM */
  description: string;
  /** Zod schema for input validation */
  inputSchema: z.ZodType;
  /**
   * Execute the tool.
   * Input is validated against inputSchema by the adapter layer at runtime.
   * Uses `any` for the input parameter to allow destructuring in implementations,
   * since Zod handles validation — not TypeScript types.
   * @param input - Validated input (cast/destructure as needed)
   * @param context - Execution context with API access
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (input: any, context: ToolExecutionContext) => Promise<TOutput>;
}

/**
 * Context provided to every tool execution.
 * Contains everything needed to call backend APIs.
 */
export interface ToolExecutionContext {
  /** Base URL for the backend API */
  apiBase: string;
  /** HTTP headers including auth (Bearer token, org ID) */
  headers: Record<string, string>;
  /** Current organization ID */
  orgId: string;
  /** Current user ID (optional — not available in all contexts) */
  userId?: string;
}

/**
 * A group of related tools (e.g., all content tools).
 */
export interface ToolGroup {
  /** Group name for organizational purposes */
  name: string;
  /** Tools in this group */
  tools: ToolDefinition[];
}
