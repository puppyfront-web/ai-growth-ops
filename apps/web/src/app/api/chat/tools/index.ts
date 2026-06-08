import { createContentTools } from './content-tools';
import { createPublishTools } from './publish-tools';
import { createInteractionTools } from './interaction-tools';
import { createResearchTools } from './research-tools';
import type { AuthContext } from './_shared';

export type { AuthContext } from './_shared';

export function createTools(auth: AuthContext) {
  return {
    ...createContentTools(auth),
    ...createPublishTools(auth),
    ...createInteractionTools(auth),
    ...createResearchTools(auth),
  };
}
