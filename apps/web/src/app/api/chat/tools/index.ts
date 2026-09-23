import { getAllTools } from '@ai-growth-ops/ai-tools';
import { toVercelTools } from '@ai-growth-ops/ai-tools/adapters/vercel-ai';
import type { AuthContext } from './_shared';

export type { AuthContext } from './_shared';

export function createTools(auth: AuthContext) {
  const context = {
    apiBase: process.env.API_BASE_URL || 'http://127.0.0.1:3100',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${auth.token}`,
      'x-organization-id': auth.orgId
    },
    orgId: auth.orgId
  };
  return toVercelTools(getAllTools(), context);
}
