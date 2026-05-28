import type { Prisma } from '@prisma/client';

import type { DatabaseClient } from '../client';
import { activeByUser, softDeleteData } from './base-repository';

export function createContentProjectRepository(db: DatabaseClient) {
  return {
    create(data: Prisma.ContentProjectUncheckedCreateInput) {
      return db.contentProject.create({ data });
    },

    getById(id: string) {
      return db.contentProject.findFirst({ where: { id, deletedAt: null } });
    },

    listActiveByUser(userId: string) {
      return db.contentProject.findMany({
        where: activeByUser(userId),
        orderBy: { createdAt: 'desc' }
      });
    },

    update(id: string, data: Prisma.ContentProjectUpdateInput) {
      return db.contentProject.update({ where: { id }, data });
    },

    softDelete(id: string) {
      return db.contentProject.update({
        where: { id },
        data: softDeleteData()
      });
    }
  };
}
