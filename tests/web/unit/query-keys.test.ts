import { describe, it, expect } from 'vitest';
import { queryKeys } from '@/lib/query-keys';

describe('queryKeys', () => {
  it('generates consistent key for research tasks', () => {
    expect(queryKeys.research.tasks).toEqual(['research', 'tasks']);
  });

  it('generates consistent key for content item with id', () => {
    expect(queryKeys.content.item('abc-123')).toEqual([
      'content',
      'item',
      'abc-123'
    ]);
  });

  it('generates consistent key for lead activities', () => {
    expect(queryKeys.leads.activities('lead-1')).toEqual([
      'leads',
      'lead-1',
      'activities'
    ]);
  });

  it('generates consistent key for auth', () => {
    expect(queryKeys.auth.me).toEqual(['auth', 'me']);
  });

  it('generates consistent key for publish job', () => {
    expect(queryKeys.publish.job('job-42')).toEqual([
      'publish',
      'job',
      'job-42'
    ]);
  });
});
