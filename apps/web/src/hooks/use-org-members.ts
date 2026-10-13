'use client';

import { useQuery } from '@tanstack/react-query';
import { getProfile, getOrgMembers } from '@/lib/api/settings';

/** 当前组织的成员列表（依赖 profile 中的 organization.id）。 */
export function useOrgMembers() {
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile
  });
  const orgId = profile?.organization?.id;

  return useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => getOrgMembers(orgId as string),
    enabled: Boolean(orgId)
  });
}
