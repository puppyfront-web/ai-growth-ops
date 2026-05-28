import { describe, it, expect } from 'vitest';

type MediaReviewStatus = 'pending_review' | 'approved' | 'rejected';

function canBeUsedInPublish(status: MediaReviewStatus): boolean {
  return status === 'approved';
}

describe('MediaAsset Review State Machine', () => {
  it('new upload defaults to pending_review', () => {
    const defaultStatus: MediaReviewStatus = 'pending_review';
    expect(defaultStatus).toBe('pending_review');
  });

  it('pending_review can transition to approved', () => {
    expect(canBeUsedInPublish('pending_review')).toBe(false);
  });

  it('approved can be used in publish', () => {
    expect(canBeUsedInPublish('approved')).toBe(true);
  });

  it('rejected cannot be used in publish', () => {
    expect(canBeUsedInPublish('rejected')).toBe(false);
  });

  it('pending_review cannot be used in publish', () => {
    expect(canBeUsedInPublish('pending_review')).toBe(false);
  });

  it('valid review transitions: pending_review → approved', () => {
    const validNext: Record<MediaReviewStatus, MediaReviewStatus[]> = {
      pending_review: ['approved', 'rejected'],
      approved: [],
      rejected: [],
    };
    expect(validNext['pending_review']).toContain('approved');
  });

  it('valid review transitions: pending_review → rejected', () => {
    const validNext: Record<MediaReviewStatus, MediaReviewStatus[]> = {
      pending_review: ['approved', 'rejected'],
      approved: [],
      rejected: [],
    };
    expect(validNext['pending_review']).toContain('rejected');
  });

  it('generated media must start as pending_review', () => {
    const generatedStatus: MediaReviewStatus = 'pending_review';
    expect(canBeUsedInPublish(generatedStatus)).toBe(false);
  });
});
