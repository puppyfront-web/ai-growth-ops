export type MediaGenKind = 'image' | 'video';

export type StoredMediaGeneration = {
  mode?: string;
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  videoMode?: string;
  videoProvider?: string;
  videoApiKey?: string;
  videoBaseUrl?: string;
  videoModel?: string;
};

export type MediaGenCredentials = {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

const MASK = '••••••••';

export function isMaskedSecret(value: string | undefined): boolean {
  return !value || value === MASK || /^•+$/.test(value);
}

export function pickGeneratedMediaUrl(payload: unknown): {
  url?: string;
  b64?: string;
} {
  if (!payload || typeof payload !== 'object') return {};
  const root = payload as Record<string, unknown>;
  const data = Array.isArray(root.data) ? root.data[0] : undefined;
  const row =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>)
      : undefined;
  const output =
    root.output && typeof root.output === 'object'
      ? (root.output as Record<string, unknown>)
      : undefined;
  const url =
    (typeof row?.url === 'string' && row.url) ||
    (typeof row?.video_url === 'string' && row.video_url) ||
    (typeof root.url === 'string' && root.url) ||
    (typeof root.video_url === 'string' && root.video_url) ||
    (typeof output?.url === 'string' && output.url) ||
    undefined;
  const b64 =
    (typeof row?.b64_json === 'string' && row.b64_json) ||
    (typeof root.b64_json === 'string' && root.b64_json) ||
    undefined;
  return { url, b64 };
}

export function mergeMediaGeneration(
  incoming: StoredMediaGeneration | undefined,
  existing: StoredMediaGeneration | undefined
): StoredMediaGeneration {
  const next = { ...(existing ?? {}), ...(incoming ?? {}) };
  if (isMaskedSecret(incoming?.apiKey)) {
    next.apiKey = existing?.apiKey ?? '';
  }
  if (isMaskedSecret(incoming?.videoApiKey)) {
    next.videoApiKey = existing?.videoApiKey ?? '';
  }
  return next;
}

export function credentialsFromSaved(
  saved: Record<string, unknown> | null,
  kind: MediaGenKind,
  env: NodeJS.ProcessEnv = process.env
): MediaGenCredentials {
  const media = (saved?.mediaGeneration ?? {}) as StoredMediaGeneration;
  if (kind === 'video') {
    const mode = media.videoMode ?? media.mode ?? env.MEDIA_GEN_VIDEO_MODE ?? 'dedicated';
    if (mode === 'llm_provider') {
      return {
        provider: String(saved?.provider ?? env.AI_PROVIDER ?? 'openai'),
        apiKey: String(
          saved?.apiKey ?? env.AI_API_KEY ?? env.OPENAI_API_KEY ?? ''
        ),
        baseUrl: String(
          media.videoBaseUrl ||
            saved?.baseUrl ||
            env.MEDIA_GEN_VIDEO_BASE_URL ||
            env.AI_BASE_URL ||
            ''
        ),
        model: String(
          media.videoModel || env.MEDIA_GEN_VIDEO_MODEL || 'sora-2'
        )
      };
    }
    return {
      provider: String(
        media.videoProvider || env.MEDIA_GEN_VIDEO_PROVIDER || 'openai'
      ),
      apiKey: String(
        media.videoApiKey || env.MEDIA_GEN_VIDEO_API_KEY || ''
      ),
      baseUrl: String(
        media.videoBaseUrl || env.MEDIA_GEN_VIDEO_BASE_URL || ''
      ),
      model: String(media.videoModel || env.MEDIA_GEN_VIDEO_MODEL || 'sora-2')
    };
  }

  const mode = media.mode ?? env.MEDIA_GEN_MODE ?? 'llm_provider';
  if (mode === 'dedicated') {
    return {
      provider: String(media.provider || env.MEDIA_GEN_PROVIDER || 'openai'),
      apiKey: String(media.apiKey || env.MEDIA_GEN_API_KEY || ''),
      baseUrl: String(
        media.baseUrl || env.MEDIA_GEN_BASE_URL || 'https://api.openai.com/v1'
      ),
      model: String(media.model || env.MEDIA_GEN_MODEL || 'dall-e-3')
    };
  }
  return {
    provider: String(saved?.provider ?? env.AI_PROVIDER ?? 'openai'),
    apiKey: String(saved?.apiKey ?? env.AI_API_KEY ?? env.OPENAI_API_KEY ?? ''),
    baseUrl: String(
      media.baseUrl || saved?.baseUrl || env.AI_BASE_URL || 'https://api.openai.com/v1'
    ),
    model: String(media.model || env.AI_IMAGE_MODEL || 'dall-e-3')
  };
}

export function generationEndpoint(baseUrl: string, kind: MediaGenKind): string {
  const root = baseUrl.replace(/\/$/, '');
  if (kind === 'video') {
    if (/\/videos?\//i.test(root) || /\/videos?$/i.test(root)) return root;
    return `${root}/videos/generations`;
  }
  if (/\/images\//i.test(root) || /\/images$/i.test(root)) return root;
  return `${root}/images/generations`;
}

export function publicMediaGeneration(media: StoredMediaGeneration) {
  return {
    mode: media.mode ?? 'llm_provider',
    provider: media.provider ?? 'openai',
    apiKey: media.apiKey ? MASK : '',
    baseUrl: media.baseUrl ?? '',
    model: media.model ?? 'dall-e-3',
    videoMode: media.videoMode ?? 'dedicated',
    videoProvider: media.videoProvider ?? 'openai',
    videoApiKey: media.videoApiKey ? MASK : '',
    videoBaseUrl: media.videoBaseUrl ?? '',
    videoModel: media.videoModel ?? ''
  };
}
