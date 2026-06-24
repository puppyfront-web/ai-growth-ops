import { decryptToken } from '@ai-growth-ops/providers';
import { createLLMClient } from '@ai-growth-ops/ai';
import type { LLMClient } from '@ai-growth-ops/runtime';
import type { DatabaseClient } from '@ai-growth-ops/database';

interface StoredLlmConfig {
  provider?: string;
  apiKeyEncrypted?: string;
  baseUrl?: string;
  model?: string;
}

/**
 * Resolve an LLMClient from the org-level LLM config the operator set via the
 * cockpit UI (AppConfig key='llm_config'). The apiKey is decrypted server-side
 * here — it never enters the LLM message stream; the client uses it only as an
 * Authorization header. Returns undefined when no config / no key is stored, so
 * the caller (agent.run.ts) falls back to the dev stub or createLLMClient()
 * (env).
 *
 * Mirrors createDbCredentialResolver (./credentials.ts): same AppConfig-style
 * read, same decryptToken, same "absent → undefined, never crash the run"
 * contract. baseUrl/model left undefined when blank so createLLMClient falls
 * through to its env defaults.
 */
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
      provider: (cfg.provider ?? 'openai') as 'openai' | 'anthropic',
      apiKey,
      baseUrl: cfg.baseUrl || undefined,
      model: cfg.model || undefined
    });
  } catch {
    // Undecryptable key / corrupt config — treat as absent rather than
    // crashing the run; env fallback still applies.
    return undefined;
  }
}
