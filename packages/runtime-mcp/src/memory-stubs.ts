import type {
  WorkingMemory,
  PreferencesStore,
  UserPreferences,
  PreferenceDomain
} from '@ai-growth-ops/runtime';

/** In-memory WorkingMemory for host-mode first slice. Production swaps to Redis. */
export class InMemoryWorkingMemory implements WorkingMemory {
  private store = new Map<string, Map<string, unknown>>();

  private bucket(runId: string): Map<string, unknown> {
    let b = this.store.get(runId);
    if (!b) {
      b = new Map();
      this.store.set(runId, b);
    }
    return b;
  }

  async get(runId: string, key: string): Promise<unknown> {
    return this.bucket(runId).get(key);
  }
  async set(runId: string, key: string, value: unknown): Promise<void> {
    this.bucket(runId).set(key, value);
  }
  async all(runId: string): Promise<Record<string, unknown>> {
    return Object.fromEntries(this.bucket(runId));
  }
  async clear(runId: string): Promise<void> {
    this.store.delete(runId);
  }
}

const DOMAIN_KEYS: Record<PreferenceDomain, (keyof UserPreferences)[]> = {
  content: ['contentStylePreferences', 'brandVoice', 'avoidTopics', 'defaultContentType'],
  publish: ['preferredPlatforms', 'preferredPublishTimes'],
  interaction: ['replyStylePreferences'],
  lead: ['preferredPlatforms'],
  global: [
    'preferredPlatforms',
    'defaultContentType',
    'preferredPublishTimes',
    'contentStylePreferences',
    'replyStylePreferences',
    'avoidTopics',
    'brandVoice'
  ]
};

/** PreferencesStore backed by a fixed seed; used by host-mode first slice. */
export class StaticPreferencesStore implements PreferencesStore {
  constructor(private readonly seed: UserPreferences) {}

  async get(): Promise<UserPreferences> {
    return this.seed;
  }
  async set(): Promise<void> {
    // No-op for the static stub; production uses DB.
  }
  async forDomain(_userId: string, domain: PreferenceDomain): Promise<Partial<UserPreferences>> {
    const keys = DOMAIN_KEYS[domain];
    const out: Partial<UserPreferences> = {};
    for (const k of keys) {
      if (k in this.seed) (out as Record<string, unknown>)[k] = (this.seed as unknown as Record<string, unknown>)[k];
    }
    return out;
  }
}
