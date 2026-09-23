import { decryptToken, encryptToken } from '@ai-growth-ops/providers';
import { createLLMClient } from '@ai-growth-ops/ai';
import type { LLMClient, LLMProvider } from '@ai-growth-ops/ai';
import type { DatabaseClient } from './client.js';

export interface StoredLlmConfig {
  provider?: string;
  apiKeyEncrypted?: string;
  baseUrl?: string;
  model?: string;
  updatedAt?: string;
}

export async function loadStoredLlmConfig(db: DatabaseClient, orgId: string) {
  return db.appConfig.findFirst({
    where: { organizationId: orgId, key: { in: [`llm_config:${orgId}`, 'llm_config'] } },
    orderBy: { key: 'desc' }
  });
}

export async function saveOrgLlmConfig(
  db: DatabaseClient, orgId: string, userId: string,
  input: { provider?: LLMProvider; apiKey?: string; baseUrl?: string; model?: string }
): Promise<StoredLlmConfig> {
  const row = await loadStoredLlmConfig(db, orgId);
  const previous = (row?.value ?? {}) as StoredLlmConfig;
  const value = {
    provider: input.provider ?? previous.provider ?? 'openai',
    baseUrl: input.baseUrl ?? previous.baseUrl ?? '',
    model: input.model ?? previous.model ?? '',
    apiKeyEncrypted: input.apiKey?.trim()
      ? encryptToken(input.apiKey.trim()) : previous.apiKeyEncrypted ?? '',
    updatedAt: new Date().toISOString()
  };
  if (row) {
    await db.appConfig.update({ where: { id: row.id }, data: { value } });
  } else {
    await db.appConfig.create({ data: { organizationId: orgId, userId, key: `llm_config:${orgId}`, value } });
  }
  return value;
}

export async function resolveLlmConfigFromDb(db: DatabaseClient, orgId: string) {
  const row = await loadStoredLlmConfig(db, orgId);
  const cfg = (row?.value ?? null) as StoredLlmConfig | null;
  if (!cfg) return undefined;
  return {
    provider: inferProvider(cfg),
    apiKey: cfg.apiKeyEncrypted ? decryptToken(cfg.apiKeyEncrypted) : '',
    baseUrl: cfg.baseUrl || undefined,
    model: cfg.model || undefined
  };
}

function inferProvider(cfg: StoredLlmConfig): LLMProvider {
  const baseUrl = cfg.baseUrl ?? '';
  const model = (cfg.model ?? '').toLowerCase();
  if (baseUrl && !baseUrl.includes('anthropic.com')) return 'openai';
  if (model.startsWith('claude')) return 'anthropic';
  return cfg.provider === 'anthropic' ? 'anthropic' : 'openai';
}

export async function resolveLlmClientFromDb(
  db: DatabaseClient,
  orgId: string
): Promise<LLMClient | undefined> {
  const cfg = await resolveLlmConfigFromDb(db, orgId);
  if (!cfg) return undefined;
  return createLLMClient(cfg);
}
