import { describe, it, expect } from 'vitest';
import { getToolsForAgent, inferMutate } from '@ai-growth-ops/runtime';
import type { AgentDefinition } from '@ai-growth-ops/runtime';

const contentAgent: AgentDefinition = {
  name: 'content', domain: 'content', description: '',
  systemPromptBuilder: () => '',
  allowedTools: ['content.list_videos', 'content.write', 'shared.get_today_metrics']
};

describe('tool access', () => {
  it('inferMutate uses explicit override', () => {
    const agent: AgentDefinition = { ...contentAgent, mutateInference: { 'content.write': 'Read' } };
    expect(inferMutate('content.write', agent)).toBe('Read');
  });

  it('inferMutate marks publish/reply/auth.login/lead.convert as Write', () => {
    expect(inferMutate('publish.video', contentAgent)).toBe('Write');
    expect(inferMutate('interaction.reply_comment', contentAgent)).toBe('Write');
    expect(inferMutate('auth.login', contentAgent)).toBe('Write');
    expect(inferMutate('lead.convert', contentAgent)).toBe('Write');
  });

  it('inferMutate defaults to Read', () => {
    expect(inferMutate('content.list_videos', contentAgent)).toBe('Read');
    expect(inferMutate('shared.get_today_metrics', contentAgent)).toBe('Read');
  });

  it('getToolsForAgent returns only allow-listed tools that exist in registry', () => {
    const tools = getToolsForAgent(contentAgent);
    const names = tools.map((t) => t.name);
    // every returned tool is in the allow-list
    for (const n of names) expect(contentAgent.allowedTools).toContain(n);
  });
});
