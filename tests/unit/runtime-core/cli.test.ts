import { describe, expect, it } from 'vitest';
import { resolveInteractionFetchType } from '../../../apps/runtime-core/src/entrypoints/cli';

describe('resolveInteractionFetchType', () => {
  it('keeps the historical defaults when --type is omitted', () => {
    expect(resolveInteractionFetchType('douyin', [])).toBe('comments');
    expect(resolveInteractionFetchType('xiaohongshu', [])).toBe('messages');
  });

  it('respects an explicit --type flag', () => {
    expect(resolveInteractionFetchType('douyin', ['--type=messages'])).toBe(
      'messages'
    );
    expect(
      resolveInteractionFetchType('xiaohongshu', ['--type=comments'])
    ).toBe('comments');
  });
});
