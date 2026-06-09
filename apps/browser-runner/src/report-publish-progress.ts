import type { PublishProgressStage } from '@ai-growth-ops/shared';

export async function reportPublishProgress(
  publishJobId: string | undefined,
  stage: PublishProgressStage,
  message?: string
): Promise<void> {
  if (!publishJobId) return;

  const apiUrl = (process.env.API_URL || 'http://127.0.0.1:3100').replace(
    /\/$/,
    ''
  );
  const secret = process.env.PUBLISH_PROGRESS_SECRET;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (secret) headers['x-publish-progress-key'] = secret;

    await fetch(`${apiUrl}/api/publish-jobs/${publishJobId}/progress`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(5_000), // 5s timeout — progress reports must not block
      body: JSON.stringify({ stage, message })
    });
  } catch {
    // Progress reporting must not block publish
  }
}
