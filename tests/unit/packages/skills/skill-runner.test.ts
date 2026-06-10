import { describe, it, expect } from 'vitest';

describe('packages/skills skill-to-tool converter', () => {
  it('should convert skills to tool specs', async () => {
    const { skillToToolSpec, allSkillsToToolSpecs, initSkills, listSkills } =
      await import('@ai-growth-ops/skills');

    // Initialize skills first
    initSkills();

    // Verify skills are registered
    const skills = listSkills();
    expect(skills.length).toBe(7);

    // Convert a single skill
    const toolSpec = skillToToolSpec('lead-classification');
    expect(toolSpec).toBeDefined();
    expect(toolSpec!.name).toBe('skill_lead_classification');
    expect(toolSpec!.description).toBeTruthy();
    expect(toolSpec!.inputSchema).toBeDefined();

    // Convert all skills
    const allSpecs = allSkillsToToolSpecs();
    expect(allSpecs.length).toBe(7);

    // All should have unique names
    const names = new Set(allSpecs.map((s) => s.name));
    expect(names.size).toBe(7);
  });

  it('should return null for non-existent skill', async () => {
    const { skillToToolSpec } = await import('@ai-growth-ops/skills');
    const result = skillToToolSpec('non-existent-skill');
    expect(result).toBeNull();
  });

  it('should export getSharedSkillRunner', async () => {
    const { getSharedSkillRunner } = await import('@ai-growth-ops/skills');
    expect(typeof getSharedSkillRunner).toBe('function');

    const runner = getSharedSkillRunner();
    expect(runner).toBeDefined();
    expect(typeof runner.run).toBe('function');
    expect(typeof runner.runAdvanced).toBe('function');
  });

  it('should create skill tool call handler', async () => {
    const { createSkillToolCallHandler, getSharedSkillRunner } = await import(
      '@ai-growth-ops/skills'
    );

    const runner = getSharedSkillRunner();
    const handler = createSkillToolCallHandler(runner);
    expect(typeof handler).toBe('function');
  });
});
