import type { SkillRunner, SkillRunResult, SkillContext } from './types.js';
import { getSkill, skillExists } from './registry.js';
import { createLLMClient, loadPromptFromSKILLMd, loadSchema, createSchemaValidator, trackTokenUsage } from '@ai-growth-ops/ai';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(import.meta.url);
const DEFINITIONS_DIR = resolve(__dirname, '..', '..', 'definitions');

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
        latencyMs: Date.now() - start,
      };
    }

    try {
      const skillDir = resolve(this.definitionsDir, input.skillName);

      // Validate input
      const inputSchema = loadSchema(skillDir, 'input');
      const outputSchema = loadSchema(skillDir, 'output');
      const validator = createSchemaValidator<TInput>(inputSchema, outputSchema);
      validator.validateInput(input.input);

      // Load prompt and call LLM
      const prompt = loadPromptFromSKILLMd(skillDir);
      const client = createLLMClient();

      const contextStr = input.context ? `\n\nContext: ${JSON.stringify(input.context)}` : '';
      const messages = [
        { role: 'system' as const, content: prompt },
        { role: 'user' as const, content: `${JSON.stringify(input.input, null, 2)}${contextStr}\n\nRespond with valid JSON matching the output schema.` },
      ];

      const response = await client.chat(messages);

      // Parse JSON from response
      let parsedOutput: TOutput;
      try {
        // Try to extract JSON from markdown code blocks or raw text
        const jsonMatch = response.text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || [null, response.text];
        parsedOutput = JSON.parse(jsonMatch[1] || response.text) as TOutput;
      } catch {
        return {
          runId,
          skillName: input.skillName,
          skillVersion: input.skillVersion || '1.0.0',
          status: 'failed',
          error: `Failed to parse LLM output as JSON: ${response.text.substring(0, 200)}`,
          tokenUsage: response.tokenUsage,
          latencyMs: Date.now() - start,
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
        timestamp: new Date(),
      });

      return {
        runId,
        skillName: input.skillName,
        skillVersion: input.skillVersion || '1.0.0',
        status: 'success',
        output: parsedOutput,
        tokenUsage: response.tokenUsage,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        runId,
        skillName: input.skillName,
        skillVersion: input.skillVersion || '1.0.0',
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start,
      };
    }
  }
}
