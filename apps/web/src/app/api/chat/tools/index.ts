import { getAllTools } from '@ai-growth-ops/ai-tools';
import { toVercelTools } from '@ai-growth-ops/ai-tools/adapters/vercel-ai';
import type { AuthContext } from './_shared';

export type { AuthContext } from './_shared';

export function createTools(auth: AuthContext) {
  const context = {
    apiBase: process.env.NEXT_PUBLIC_API_URL || '',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${auth.token}`,
      'x-organization-id': auth.orgId
    },
    orgId: auth.orgId
  };
  return toVercelTools(getAllTools(), context);
}
