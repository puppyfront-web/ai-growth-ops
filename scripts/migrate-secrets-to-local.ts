import { createDatabaseClient } from '@ai-growth-ops/database';
import {
  isLocalSecretReference,
  moveTokenToLocalStorage
} from '@ai-growth-ops/providers';

function needsMigration(value: string | null | undefined): value is string {
  return Boolean(value) && !isLocalSecretReference(value!);
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && !process.env.LOCAL_DATA_DIR?.trim()) {
    throw new Error('Set LOCAL_DATA_DIR before applying the migration');
  }

  const db = createDatabaseClient();
  try {
    const [accounts, secretRefs, llmConfigs] = await Promise.all([
      db.platformAccount.findMany({
        select: {
          id: true,
          accessTokenEncrypted: true,
          refreshTokenEncrypted: true,
          cookieRef: true
        }
      }),
      db.secretRef.findMany({ select: { id: true, encryptedValue: true } }),
      db.appConfig.findMany({
        where: { key: { startsWith: 'llm_config' } },
        select: { id: true, value: true }
      })
    ]);

    let pending = 0;
    let migrated = 0;

    for (const account of accounts) {
      const data: Record<string, string> = {};
      for (const field of [
        'accessTokenEncrypted',
        'refreshTokenEncrypted',
        'cookieRef'
      ] as const) {
        const value = account[field];
        if (!needsMigration(value)) continue;
        pending += 1;
        if (apply) data[field] = moveTokenToLocalStorage(value);
      }
      if (apply && Object.keys(data).length > 0) {
        await db.platformAccount.update({ where: { id: account.id }, data });
        migrated += Object.keys(data).length;
      }
    }

    for (const secret of secretRefs) {
      if (!needsMigration(secret.encryptedValue)) continue;
      pending += 1;
      if (apply) {
        await db.secretRef.update({
          where: { id: secret.id },
          data: {
            encryptedValue: moveTokenToLocalStorage(secret.encryptedValue)
          }
        });
        migrated += 1;
      }
    }

    for (const row of llmConfigs) {
      const value = row.value as Record<string, unknown>;
      const encrypted = value.apiKeyEncrypted;
      if (typeof encrypted !== 'string' || !needsMigration(encrypted)) continue;
      pending += 1;
      if (apply) {
        await db.appConfig.update({
          where: { id: row.id },
          data: {
            value: {
              ...value,
              apiKeyEncrypted: moveTokenToLocalStorage(encrypted)
            }
          }
        });
        migrated += 1;
      }
    }

    console.log(
      apply
        ? `Migrated ${migrated} secrets to local storage.`
        : `Found ${pending} secrets. Re-run with --apply after backing up the database and local data directory.`
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
