import type { Prisma } from '@prisma/client';

import type { DatabaseClient } from '../client';
import { activeByUser, softDeleteData } from './base-repository';

export function createLeadRepository(db: DatabaseClient) {
  return {
    create(data: Prisma.LeadUncheckedCreateInput) {
      return db.lead.create({ data });
    },

    getById(id: string) {
      return db.lead.findFirst({ where: { id, deletedAt: null } });
    },

    listActiveByUser(userId: string) {
      return db.lead.findMany({
        where: activeByUser(userId),
        orderBy: { createdAt: 'desc' }
      });
    },

    update(id: string, data: Prisma.LeadUpdateInput) {
      return db.lead.update({ where: { id }, data });
    },

    softDelete(id: string) {
      return db.lead.update({
        where: { id },
        data: softDeleteData()
      });
    }
  };
}
