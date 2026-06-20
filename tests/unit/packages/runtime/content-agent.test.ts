import { describe, it, expect } from 'vitest';
import { contentAgent } from '@ai-growth-ops/runtime';

describe('content-agent definition', () => {
  it('declares content domain and allow-list', () => {
    expect(contentAgent.domain).toBe('content');
    expect(contentAgent.allowedTools).toContain('content.list_videos');
    expect(contentAgent.allowedTools).toContain('write_content');
  });

  it('builds a system prompt embedding preferences + node', () => {
    const prompt = contentAgent.systemPromptBuilder({
      userId: 'u',
      orgId: 'o',
      nodeName: 'CONTENT',
      preferences: { brandVoice: 'friendly', avoidTopics: ['politics'] },
      workingMemory: {}
    });
    expect(prompt).toContain('CONTENT');
    expect(prompt).toContain('friendly');
    expect(prompt).toContain('politics');
  });

  it('never mentions cookie / credential in the system prompt', () => {
    const prompt = contentAgent.systemPromptBuilder({
      userId: 'u',
      orgId: 'o',
      nodeName: 'CONTENT',
      preferences: {},
      workingMemory: {}
    });
    expect(prompt.toLowerCase()).not.toContain('cookie');
    expect(prompt.toLowerCase()).not.toContain('credential');
  });
});
