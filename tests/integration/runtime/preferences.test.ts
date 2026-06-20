import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createDatabaseClient, resetDatabase, seedDatabase, type DatabaseClient } from '@ai-growth-ops/database';
import { createPreferencesStore } from '@ai-growth-ops/runtime';

describe('AppConfigPreferencesStore (integration)', () => {
  let db: DatabaseClient;
  let userId: string;

  let orgId: string;
  beforeAll(async () => {
    db = createDatabaseClient();
    await resetDatabase(db);
    await seedDatabase(db);
    userId = (await db.user.findFirst({ where: { email: 'admin@ai-growth-ops.local' } }))!.id;
    orgId = (await db.organization.findFirst())!.id;
  });
  afterAll(async () => { await db.$disconnect(); });

  it('returns defaults when no preferences saved', async () => {
    const store = createPreferencesStore(db, orgId);
    const prefs = await store.get(userId);
    expect(prefs.brandVoice).toBe('');
    expect(prefs.preferredPlatforms).toEqual([]);
  });

  it('sets and reads back a single field', async () => {
    const store = createPreferencesStore(db, orgId);
    await store.set(userId, 'brandVoice', 'friendly expert');
    expect((await store.get(userId)).brandVoice).toBe('friendly expert');
  });

  it('is scoped per user (not shared across org)', async () => {
    const store = createPreferencesStore(db, orgId);
    await store.set(userId, 'avoidTopics', ['politics']);
    const other = await store.get('nonexistent-user-id');
    expect(other.avoidTopics).toEqual([]);
  });

  it('forDomain returns the content subset only', async () => {
    const store = createPreferencesStore(db, orgId);
    await store.set(userId, 'brandVoice', 'v1');
    await store.set(userId, 'preferredPlatforms', ['douyin']);
    const contentPrefs = await store.forDomain(userId, 'content');
    expect(contentPrefs).toHaveProperty('brandVoice', 'v1');
    expect(contentPrefs).not.toHaveProperty('preferredPlatforms');
  });
});
