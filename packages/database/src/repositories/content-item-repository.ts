import type { Prisma } from '@prisma/client';

import type { DatabaseClient } from '../client';
import { activeByUser, softDeleteData } from './base-repository';

export function createContentItemRepository(db: DatabaseClient) {
  return {
    create(data: Prisma.ContentItemUncheckedCreateInput) {
      return db.contentItem.create({ data });
    },

    getById(id: string) {
      return db.contentItem.findFirst({ where: { id, deletedAt: null } });
    },

    listActiveByUser(userId: string) {
      return db.contentItem.findMany({
        where: activeByUser(userId),
        orderBy: { createdAt: 'desc' }
      });
    },

    update(id: string, data: Prisma.ContentItemUpdateInput) {
      return db.contentItem.update({ where: { id }, data });
    },

    softDelete(id: string) {
      return db.contentItem.update({
        where: { id },
        data: softDeleteData()
      });
    }
  };
}
