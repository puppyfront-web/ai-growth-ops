import type { Prisma } from '@prisma/client';

import type { DatabaseClient } from '../client';
import { activeByUser, softDeleteData } from './base-repository';

export function createPublishJobRepository(db: DatabaseClient) {
  return {
    create(data: Prisma.PublishJobUncheckedCreateInput) {
      return db.publishJob.create({ data });
    },

    getById(id: string) {
      return db.publishJob.findFirst({ where: { id, deletedAt: null } });
    },

    listActiveByUser(userId: string) {
      return db.publishJob.findMany({
        where: activeByUser(userId),
        orderBy: { createdAt: 'desc' }
      });
    },

    update(id: string, data: Prisma.PublishJobUpdateInput) {
      return db.publishJob.update({ where: { id }, data });
    },

    softDelete(id: string) {
      return db.publishJob.update({
        where: { id },
        data: softDeleteData()
      });
    }
  };
}
