import type { SkillDefinition } from './types.js';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

const skills = new Map<string, SkillDefinition>();

export function registerSkill(definition: SkillDefinition): void {
  skills.set(definition.name, definition);
}

export function getSkill(name: string): SkillDefinition | undefined {
  return skills.get(name);
}

export function listSkills(): SkillDefinition[] {
  return Array.from(skills.values());
}

export function skillExists(name: string): boolean {
  return skills.has(name);
}

// Auto-discover skills from definitions directory
export function discoverSkills(definitionsDir: string): void {
  if (!existsSync(definitionsDir)) return;

  const dirs = readdirSync(definitionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const dir of dirs) {
    const schemaDir = resolve(definitionsDir, dir, 'schema');
    const inputSchemaPath = resolve(schemaDir, 'input.schema.json');
    const outputSchemaPath = resolve(schemaDir, 'output.schema.json');

    if (existsSync(inputSchemaPath) && existsSync(outputSchemaPath)) {
      const inputSchema = JSON.parse(readFileSync(inputSchemaPath, 'utf-8'));
      const outputSchema = JSON.parse(readFileSync(outputSchemaPath, 'utf-8'));

      registerSkill({
        name: dir,
        version: '1.0.0',
        description: inputSchema.description || `${dir} skill`,
        inputSchema,
        outputSchema
      });
    }
  }
}
