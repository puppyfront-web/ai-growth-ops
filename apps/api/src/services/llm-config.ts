import { decryptToken } from '@ai-growth-ops/providers';
import { createLLMClient } from '@ai-growth-ops/ai';
import type { LLMClient, LLMProvider } from '@ai-growth-ops/ai';
import type { DatabaseClient } from '@ai-growth-ops/database';

interface StoredLlmConfig {
  provider?: string;
  apiKeyEncrypted?: string;
  baseUrl?: string;
  model?: string;
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
  const row = await db.appConfig.findFirst({
    where: { organizationId: orgId, key: 'llm_config' },
    select: { value: true }
  });
  const cfg = (row?.value ?? null) as StoredLlmConfig | null;
  if (!cfg?.apiKeyEncrypted) return undefined;
  try {
    const apiKey = decryptToken(cfg.apiKeyEncrypted);
    return createLLMClient({
      provider: inferProvider(cfg),
      apiKey,
      baseUrl: cfg.baseUrl || undefined,
      model: cfg.model || undefined
    });
  } catch {
    return undefined;
  }
}
