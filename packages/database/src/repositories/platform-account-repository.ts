import type { Prisma } from '@prisma/client';

import type { DatabaseClient } from '../client';
import { activeByUser, softDeleteData } from './base-repository';

export function createPlatformAccountRepository(db: DatabaseClient) {
  return {
    create(data: Prisma.PlatformAccountUncheckedCreateInput) {
      return db.platformAccount.create({ data });
    },

    getById(id: string) {
      return db.platformAccount.findFirst({ where: { id, deletedAt: null } });
    },

    listActiveByUser(userId: string) {
      return db.platformAccount.findMany({
        where: activeByUser(userId),
        orderBy: [{ platform: 'asc' }, { name: 'asc' }]
      });
    },

    update(id: string, data: Prisma.PlatformAccountUpdateInput) {
      return db.platformAccount.update({ where: { id }, data });
    },

    softDelete(id: string) {
      return db.platformAccount.update({
        where: { id },
        data: softDeleteData()
      });
    }
  };
}
