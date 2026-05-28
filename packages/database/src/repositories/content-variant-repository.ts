import type { Prisma } from '@prisma/client';

import type { DatabaseClient } from '../client';
import { activeByUser, softDeleteData } from './base-repository';

export function createContentVariantRepository(db: DatabaseClient) {
  return {
    create(data: Prisma.ContentVariantUncheckedCreateInput) {
      return db.contentVariant.create({ data });
    },

    getById(id: string) {
      return db.contentVariant.findFirst({ where: { id, deletedAt: null } });
    },

    listActiveByUser(userId: string) {
      return db.contentVariant.findMany({
        where: activeByUser(userId),
        orderBy: { createdAt: 'desc' }
      });
    },

    update(id: string, data: Prisma.ContentVariantUpdateInput) {
      return db.contentVariant.update({ where: { id }, data });
    },

    softDelete(id: string) {
      return db.contentVariant.update({
        where: { id },
        data: softDeleteData()
      });
    }
  };
}
