import { loadRuntimeConfig } from '../config/runtime-config.js';

export async function publishViaBrowserRunner(input: {
  platform: string;
  cookie: string;
  title?: string;
  content: string;
  mediaFilePaths?: string[];
  source?: string;
}): Promise<{
  status: 'success' | 'failed';
  detail: unknown;
}> {
  const config = loadRuntimeConfig();
  const res = await fetch(`${config.browserRunnerUrl}/assist/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      platform: input.platform,
      cookie: input.cookie,
      contentType: input.mediaFilePaths?.length ? 'video' : 'article',
      title: input.title,
      content: input.content,
      mediaFilePaths: input.mediaFilePaths,
      mediaUrls: input.mediaFilePaths,
      source: input.source
    })
  });

  const data = (await res.json()) as Record<string, unknown>;
  return {
    status: data.success === false ? 'failed' : 'success',
    detail: data
  };
}
