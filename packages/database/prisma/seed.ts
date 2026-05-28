import { createDatabaseClient, seedDatabase } from '../src';

const db = createDatabaseClient();

try {
  await seedDatabase(db);
} finally {
  await db.$disconnect();
}
