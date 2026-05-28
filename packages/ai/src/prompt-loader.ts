import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export function loadPromptFromSKILLMd(skillDir: string): string {
  const skillMdPath = resolve(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) {
    throw new Error(`SKILL.md not found at ${skillMdPath}`);
  }
  const content = readFileSync(skillMdPath, 'utf-8');
  // Extract the prompt section from SKILL.md
  // Convention: content between ```prompt and ``` markers, or the full content
  const promptMatch = content.match(/```prompt\n([\s\S]*?)```/);
  if (promptMatch) return promptMatch[1].trim();
  return content.trim();
}

export function loadSchema(skillDir: string, type: 'input' | 'output'): object {
  const schemaPath = resolve(skillDir, 'schema', `${type}.schema.json`);
  if (!existsSync(schemaPath)) {
    throw new Error(`Schema not found at ${schemaPath}`);
  }
  return JSON.parse(readFileSync(schemaPath, 'utf-8'));
}
