import { describe, it, expect, beforeEach } from 'vitest';

// We test the registry functions directly by importing the built module
// Since the auto-registration happens on import, we need to test carefully

describe('Tool Registry', () => {
  // The registry auto-registers on import, so we test the exported functions
  // that work with the pre-registered tools

  it('should export all tool arrays from definitions', async () => {
    const {
      contentTools,
      publishTools,
      interactionTools,
      researchTools,
      campaignTools,
      workflowTools,
      agentTools,
      contentMediaTools
    } = await import('@ai-growth-ops/ai-tools');

    // Verify each tool array is non-empty
    expect(contentTools.length).toBeGreaterThan(0);
    expect(publishTools.length).toBeGreaterThan(0);
    expect(interactionTools.length).toBeGreaterThan(0);
    expect(researchTools.length).toBeGreaterThan(0);
    expect(campaignTools.length).toBeGreaterThan(0);
    expect(workflowTools.length).toBeGreaterThan(0);
    expect(agentTools.length).toBeGreaterThan(0);
    expect(contentMediaTools.length).toBeGreaterThan(0);
  });

  it('should register all tools on import', async () => {
    const { getAllTools, getToolCount } = await import('@ai-growth-ops/ai-tools');

    // Should have 53 tools registered (6+9+12+8+6+6+5+1 = 53)
    const count = getToolCount();
    expect(count).toBe(53);
  });

  it('should look up individual tools by name', async () => {
    const { getTool, toolExists } = await import('@ai-growth-ops/ai-tools');

    expect(toolExists('write_content')).toBe(true);
    expect(toolExists('list_accounts')).toBe(true);
    expect(toolExists('classify_interaction')).toBe(true);
    expect(toolExists('run_research')).toBe(true);
    expect(toolExists('create_campaign')).toBe(true);
    expect(toolExists('execute_plan')).toBe(true);
    expect(toolExists('generate_content_with_media')).toBe(true);

    // Non-existent tool
    expect(toolExists('non_existent_tool')).toBe(false);

    // Tool should have required properties
    const tool = getTool('write_content');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('write_content');
    expect(tool!.description).toBeTruthy();
    expect(tool!.inputSchema).toBeDefined();
    expect(typeof tool!.execute).toBe('function');
  });

  it('should return tool groups', async () => {
    const { getToolGroups } = await import('@ai-growth-ops/ai-tools');

    const groups = getToolGroups();
    expect(groups.length).toBe(8);

    const groupNames = groups.map((g) => g.name);
    expect(groupNames).toContain('content');
    expect(groupNames).toContain('publish');
    expect(groupNames).toContain('interaction');
    expect(groupNames).toContain('research');
    expect(groupNames).toContain('campaign');
    expect(groupNames).toContain('workflow');
    expect(groupNames).toContain('agent');
    expect(groupNames).toContain('content-media');
  });

  it('should list all tools via getAllTools', async () => {
    const { getAllTools } = await import('@ai-growth-ops/ai-tools');

    const tools = getAllTools();
    expect(tools.length).toBe(53);

    // All tools should have unique names
    const names = new Set(tools.map((t) => t.name));
    expect(names.size).toBe(53);
  });
});
