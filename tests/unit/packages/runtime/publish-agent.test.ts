import { describe, it, expect } from 'vitest';
import { publishAgent } from '@ai-growth-ops/runtime';

describe('publish-agent definition', () => {
  it('declares publish domain and allow-list including auth', () => {
    expect(publishAgent.domain).toBe('publish');
    expect(publishAgent.allowedTools).toContain('publish.video');
    expect(publishAgent.allowedTools).toContain('publish.check_status');
    expect(publishAgent.allowedTools).toContain('auth.login');
    expect(publishAgent.allowedTools).toContain('auth.status');
  });

  it('marks publish.video and auth.login as Write via mutateInference', () => {
    expect(publishAgent.mutateInference?.['publish.video']).toBe('Write');
    expect(publishAgent.mutateInference?.['auth.login']).toBe('Write');
  });

  it('never mentions cookie / credential in the system prompt', () => {
    const prompt = publishAgent.systemPromptBuilder({
      userId: 'u',
      orgId: 'o',
      nodeName: 'PUBLISH',
      preferences: {},
      workingMemory: {}
    });
    expect(prompt.toLowerCase()).not.toContain('cookie');
    expect(prompt.toLowerCase()).not.toContain('credential');
  });
});
