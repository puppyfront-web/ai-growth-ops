import type { SkillRunner, SkillRunResult, SkillContext } from './types.js';
import { skillExists, getSkill as _getSkill } from './registry.js';
import {
  createLLMClient,
  loadPromptFromSKILLMd,
  loadSchema,
  createSchemaValidator,
  trackTokenUsage,
  type ToolSpec,
  type ToolResult,
  type ToolCall
} from '@ai-growth-ops/ai';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(import.meta.url);
const DEFINITIONS_DIR = resolve(__dirname, '..', '..', 'definitions');

export interface SkillRunAdvancedOptions<TInput = unknown> {
  skillName: string;
  skillVersion?: string;
  input: TInput;
  context?: SkillContext;
  /** Tools available to the skill for multi-step execution */
  tools?: ToolSpec[];
  /** Handler for tool calls */
  onToolCall?: (call: ToolCall) => Promise<ToolResult>;
  /** Max tool rounds per skill execution (default 3) */
  maxToolRounds?: number;
}

export class DefaultSkillRunner implements SkillRunner {
  private definitionsDir: string;

  constructor(definitionsDir?: string) {
    this.definitionsDir = definitionsDir || DEFINITIONS_DIR;
  }

  async run<TInput, TOutput>(input: {
    skillName: string;
    skillVersion?: string;
    input: TInput;
    context?: SkillContext;
  }): Promise<SkillRunResult<TOutput>> {
    const start = Date.now();
    const runId = randomUUID();

    // Check skill exists
    if (!skillExists(input.skillName)) {
      return {
        runId,
        skillName: input.skillName,
        skillVersion: input.skillVersion || '1.0.0',
        status: 'failed',
        error: `Skill not found: ${input.skillName}`,
        latencyMs: Date.now() - start
      };
    }

    try {
      const skillDir = resolve(this.definitionsDir, input.skillName);

      // Validate input
      const inputSchema = loadSchema(skillDir, 'input');
      const outputSchema = loadSchema(skillDir, 'output');
      const validator = createSchemaValidator<TInput>(
        inputSchema,
        outputSchema
      );
      validator.validateInput(input.input);

      // Load prompt and call LLM
      const prompt = loadPromptFromSKILLMd(skillDir);
      const client = createLLMClient();

      const contextStr = input.context
        ? `\n\nContext: ${JSON.stringify(input.context)}`
        : '';
      const messages = [
        { role: 'system' as const, content: prompt },
        {
          role: 'user' as const,
          content: `${JSON.stringify(input.input, null, 2)}${contextStr}\n\nRespond with valid JSON matching the output schema.`
        }
      ];

      const response = await client.chat(messages);

      // Parse JSON from response
      let parsedOutput: TOutput;
      try {
        // Try to extract JSON from markdown code blocks or raw text
        const jsonMatch = response.text.match(
          /```(?:json)?\s*\n?([\s\S]*?)\n?```/
        ) || [null, response.text];
        parsedOutput = JSON.parse(jsonMatch[1] || response.text) as TOutput;
      } catch {
        return {
          runId,
          skillName: input.skillName,
          skillVersion: input.skillVersion || '1.0.0',
          status: 'failed',
          error: `Failed to parse LLM output as JSON: ${response.text.substring(0, 200)}`,
          tokenUsage: response.tokenUsage,
          latencyMs: Date.now() - start
        };
      }

      // Validate output
      validator.validateOutput(parsedOutput);

      // Track token usage
      trackTokenUsage({
        skillName: input.skillName,
        model: response.model,
        provider: response.provider,
        inputTokens: response.tokenUsage.inputTokens,
        outputTokens: response.tokenUsage.outputTokens,
        totalTokens: response.tokenUsage.totalTokens,
        latencyMs: response.latencyMs,
        timestamp: new Date()
      });

      return {
        runId,
        skillName: input.skillName,
        skillVersion: input.skillVersion || '1.0.0',
        status: 'success',
        output: parsedOutput,
        tokenUsage: response.tokenUsage,
        latencyMs: Date.now() - start
      };
    } catch (err) {
      return {
        runId,
        skillName: input.skillName,
        skillVersion: input.skillVersion || '1.0.0',
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start
      };
    }
  }

  /**
   * Run a skill with optional tool support.
   * If tools are provided, uses chatWithTools() for multi-step execution.
   * Otherwise, falls back to the simple chat() flow (same as run()).
   */
  async runAdvanced<TInput, TOutput>(
    options: SkillRunAdvancedOptions<TInput>
  ): Promise<SkillRunResult<TOutput>> {
    const start = Date.now();
    const runId = randomUUID();

    // Check skill exists
    if (!skillExists(options.skillName)) {
      return {
        runId,
        skillName: options.skillName,
        skillVersion: options.skillVersion || '1.0.0',
        status: 'failed',
        error: `Skill not found: ${options.skillName}`,
        latencyMs: Date.now() - start
      };
    }

    try {
      const skillDir = resolve(this.definitionsDir, options.skillName);

      // Validate input
      const inputSchema = loadSchema(skillDir, 'input');
      const outputSchema = loadSchema(skillDir, 'output');
      const validator = createSchemaValidator<TInput>(
        inputSchema,
        outputSchema
      );
      validator.validateInput(options.input);

      // Load prompt
      const prompt = loadPromptFromSKILLMd(skillDir);
      const client = createLLMClient();

      const contextStr = options.context
        ? `\n\nContext: ${JSON.stringify(options.context)}`
        : '';
      const messages = [
        { role: 'system' as const, content: prompt },
        {
          role: 'user' as const,
          content: `${JSON.stringify(options.input, null, 2)}${contextStr}\n\nRespond with valid JSON matching the output schema.`
        }
      ];

      // Use chatWithTools if tools provided, otherwise simple chat
      if (options.tools && options.tools.length > 0 && options.onToolCall) {
        const response = await client.chatWithTools(messages, {
          tools: options.tools,
          onToolCall: options.onToolCall,
          maxToolRounds: options.maxToolRounds ?? 3
        });

        // Parse JSON from response
        let parsedOutput: TOutput;
        try {
          const jsonMatch = response.text.match(
            /```(?:json)?\s*\n?([\s\S]*?)\n?```/
          ) || [null, response.text];
          parsedOutput = JSON.parse(jsonMatch[1] || response.text) as TOutput;
        } catch {
          return {
            runId,
            skillName: options.skillName,
            skillVersion: options.skillVersion || '1.0.0',
            status: 'failed',
            error: `Failed to parse LLM output as JSON: ${response.text.substring(0, 200)}`,
            tokenUsage: response.tokenUsage,
            latencyMs: Date.now() - start
          };
        }

        validator.validateOutput(parsedOutput);

        trackTokenUsage({
          skillName: options.skillName,
          model: response.model,
          provider: response.provider,
          inputTokens: response.tokenUsage.inputTokens,
          outputTokens: response.tokenUsage.outputTokens,
          totalTokens: response.tokenUsage.totalTokens,
          latencyMs: response.latencyMs,
          timestamp: new Date()
        });

        return {
          runId,
          skillName: options.skillName,
          skillVersion: options.skillVersion || '1.0.0',
          status: 'success',
          output: parsedOutput,
          tokenUsage: response.tokenUsage,
          latencyMs: Date.now() - start
        };
      } else {
        // No tools — delegate to the standard run() flow
        return this.run<TInput, TOutput>({
          skillName: options.skillName,
          skillVersion: options.skillVersion,
          input: options.input,
          context: options.context
        });
      }
    } catch (err) {
      return {
        runId,
        skillName: options.skillName,
        skillVersion: options.skillVersion || '1.0.0',
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start
      };
    }
  }
}
