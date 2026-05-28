import type { Prisma } from '@prisma/client';

import type { DatabaseClient } from '../client';
import { activeByUser, softDeleteData } from './base-repository';

export function createInteractionRepository(db: DatabaseClient) {
  return {
    create(data: Prisma.InteractionUncheckedCreateInput) {
      return db.interaction.create({ data });
    },

    getById(id: string) {
      return db.interaction.findFirst({ where: { id, deletedAt: null } });
    },

    listActiveByUser(userId: string) {
      return db.interaction.findMany({
        where: activeByUser(userId),
        orderBy: { receivedAt: 'desc' }
      });
    },

    update(id: string, data: Prisma.InteractionUpdateInput) {
      return db.interaction.update({ where: { id }, data });
    },

    softDelete(id: string) {
      return db.interaction.update({
        where: { id },
        data: softDeleteData()
      });
    }
  };
}
