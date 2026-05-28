import type { DatabaseClient } from '../client';
import { createContentItemRepository } from './content-item-repository';
import { createContentProjectRepository } from './content-project-repository';
import { createContentVariantRepository } from './content-variant-repository';
import { createInteractionRepository } from './interaction-repository';
import { createLeadRepository } from './lead-repository';
import { createPlatformAccountRepository } from './platform-account-repository';
import { createPublishJobRepository } from './publish-job-repository';
import { createResearchTaskRepository } from './research-task-repository';
import { createUserRepository } from './user-repository';

export function createRepositories(db: DatabaseClient) {
  return {
    users: createUserRepository(db),
    platformAccounts: createPlatformAccountRepository(db),
    contentProjects: createContentProjectRepository(db),
    contentItems: createContentItemRepository(db),
    contentVariants: createContentVariantRepository(db),
    publishJobs: createPublishJobRepository(db),
    interactions: createInteractionRepository(db),
    leads: createLeadRepository(db),
    researchTasks: createResearchTaskRepository(db)
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
