import type { Prisma } from '@prisma/client';

import type { DatabaseClient } from '../client';
import { activeByUser, softDeleteData } from './base-repository';

export function createResearchTaskRepository(db: DatabaseClient) {
  return {
    create(data: Prisma.ResearchTaskUncheckedCreateInput) {
      return db.researchTask.create({ data });
    },

    getById(id: string) {
      return db.researchTask.findFirst({ where: { id, deletedAt: null } });
    },

    listActiveByUser(userId: string) {
      return db.researchTask.findMany({
        where: activeByUser(userId),
        orderBy: { createdAt: 'desc' }
      });
    },

    update(id: string, data: Prisma.ResearchTaskUpdateInput) {
      return db.researchTask.update({ where: { id }, data });
    },

    softDelete(id: string) {
      return db.researchTask.update({
        where: { id },
        data: softDeleteData()
      });
    }
  };
}
