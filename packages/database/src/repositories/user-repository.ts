import type { Prisma } from '@prisma/client';

import type { DatabaseClient } from '../client';

export function createUserRepository(db: DatabaseClient) {
  return {
    create(data: Prisma.UserCreateInput) {
      return db.user.create({ data });
    },

    getById(id: string) {
      return db.user.findFirst({ where: { id, deletedAt: null } });
    },

    getByEmail(email: string) {
      return db.user.findFirst({ where: { email, deletedAt: null } });
    },

    update(id: string, data: Prisma.UserUpdateInput) {
      return db.user.update({ where: { id }, data });
    },

    softDelete(id: string) {
      return db.user.update({
        where: { id },
        data: { deletedAt: new Date() }
      });
    }
  };
}
