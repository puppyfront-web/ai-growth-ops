import { describe, expect, it } from 'vitest';
import { filterPreviouslySeenProspects } from '@ai-growth-ops/database';

describe('filterPreviouslySeenProspects', () => {
  it('keeps new users and reports previously seen users once', () => {
    const result = filterPreviouslySeenProspects(
      [
        { userKey: 'douyin:new', content: 'new' },
        { userKey: 'douyin:seen', content: 'old' },
        { userKey: 'douyin:seen', content: 'duplicate evidence' }
      ],
      new Set(['douyin:seen'])
    );

    expect(result.prospects).toEqual([
      { userKey: 'douyin:new', content: 'new' }
    ]);
    expect(result.skippedUserKeys).toEqual(new Set(['douyin:seen']));
  });
});
