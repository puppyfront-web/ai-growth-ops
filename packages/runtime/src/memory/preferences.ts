import type { DatabaseClient } from '@ai-growth-ops/database';
import type { Prisma } from '@prisma/client';
import type { PreferencesStore, PreferenceDomain, UserPreferences } from '../types.js';

const PREF_KEY = 'agent_user_preferences';

const DEFAULTS: UserPreferences = {
  preferredPlatforms: [],
  defaultContentType: 'text_image',
  preferredPublishTimes: [],
  contentStylePreferences: '',
  replyStylePreferences: '',
  avoidTopics: [],
  brandVoice: ''
};

const DOMAIN_FIELDS: Record<PreferenceDomain, Array<keyof UserPreferences>> = {
  content: ['brandVoice', 'contentStylePreferences', 'avoidTopics', 'defaultContentType'],
  publish: ['preferredPlatforms', 'preferredPublishTimes'],
  interaction: ['replyStylePreferences', 'avoidTopics'],
  lead: [],
  global: Object.keys(DEFAULTS) as Array<keyof UserPreferences>
};

export class AppConfigPreferencesStore implements PreferencesStore {
  constructor(private readonly db: DatabaseClient, private readonly orgId: string) {}

  async get(userId: string): Promise<UserPreferences> {
    const row = await this.db.appConfig.findUnique({
      where: { userId_key: { userId, key: PREF_KEY } }
    });
    if (!row) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(row.value as Partial<UserPreferences>) };
  }

  async set(userId: string, key: keyof UserPreferences, value: string | string[]): Promise<void> {
    const current = await this.get(userId);
    const merged: UserPreferences = { ...current, [key]: value } as UserPreferences;
    const jsonValue = merged as unknown as Prisma.InputJsonValue;
    await this.db.appConfig.upsert({
      where: { userId_key: { userId, key: PREF_KEY } },
      create: { userId, key: PREF_KEY, organizationId: this.orgId, value: jsonValue },
      update: { value: jsonValue }
    });
  }

  async forDomain(userId: string, domain: PreferenceDomain): Promise<Partial<UserPreferences>> {
    const all = await this.get(userId);
    const fields = DOMAIN_FIELDS[domain];
    const out: Partial<UserPreferences> = {};
    for (const f of fields) (out as Record<string, unknown>)[f] = all[f];
    return out;
  }
}

export function createPreferencesStore(db: DatabaseClient, orgId: string): PreferencesStore {
  return new AppConfigPreferencesStore(db, orgId);
}
