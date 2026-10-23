'use client';

import Link from 'next/link';
import type {
  ProspectCandidate,
  ProspectEvidence,
  ProspectUserProfile
} from '@/lib/api/prospecting';

export const prospectLevelLabels: Record<string, string> = {
  A: '高意向',
  B: '中意向',
  C: '低意向',
  D: '无效'
};

export function candidateComments(
  candidate: ProspectCandidate
): ProspectEvidence[] {
  const list =
    candidate.evidence && candidate.evidence.length > 0
      ? candidate.evidence
      : [
          {
            content: candidate.content,
            sourceVideoTitle: candidate.sourceVideoTitle,
            sourceVideoUrl: candidate.sourceVideoUrl,
            publishedAt: null,
            likeCount: null
          }
        ];
  return [...list].sort((a, b) => {
    if (a.content === candidate.content && b.content !== candidate.content) {
      return -1;
    }
    if (b.content === candidate.content && a.content !== candidate.content) {
      return 1;
    }
    return (b.likeCount ?? 0) - (a.likeCount ?? 0);
  });
}

function formatCount(value: number | null | undefined): string {
  if (value == null) return '-';
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return String(value);
}

export function ProfileSummary({ profile }: { profile: ProspectUserProfile }) {
  return (
    <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs space-y-1">
      {profile.signature && (
        <p className="whitespace-pre-wrap">{profile.signature}</p>
      )}
      <p className="text-muted-foreground">
        粉丝 {formatCount(profile.followerCount)} · 关注{' '}
        {formatCount(profile.followingCount)} · 获赞{' '}
        {formatCount(profile.likeCount)}
        {profile.location ? ` · ${profile.location}` : ''}
      </p>
    </div>
  );
}

export function ConvertedBadge({ customerId }: { customerId: string }) {
  return (
    <Link
      href={`/customers/${customerId}`}
      className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success hover:bg-success/20"
    >
      已转客户
    </Link>
  );
}
