/**
 * Operational Context Builder
 *
 * Fetches real-time operational data and builds a compact context block
 * that gets injected into the AI system prompt each conversation turn.
 */

export interface OperationalContext {
  recentActivity: string;
  attentionItems: string[];
  userPreferences: Record<string, unknown>;
  activeCampaigns: string;
}

export async function buildOperationalContext(
  apiBase: string,
  headers: Record<string, string>,
): Promise<string> {
  const sections: string[] = [];

  // Fetch operational data in parallel
  const [suggestionsRes, preferencesRes, campaignsRes, accountsRes] = await Promise.allSettled([
    fetch(`${apiBase}/api/agent/suggestions`, { headers }),
    fetch(`${apiBase}/api/settings/agent-preferences`, { headers }),
    fetch(`${apiBase}/api/campaigns?page=1&pageSize=5&status=active`, { headers }),
    fetch(`${apiBase}/api/accounts`, { headers }),
  ]);

  // 1. Attention items from suggestions
  if (suggestionsRes.status === 'fulfilled' && suggestionsRes.value.ok) {
    const data = await suggestionsRes.value.json() as { suggestions: Array<{ priority: string; title: string; description: string; actionPrompt: string }> };
    if (data.suggestions?.length > 0) {
      const items = data.suggestions
        .map((s) => `[${s.priority === 'high' ? '⚠️' : s.priority === 'medium' ? '📋' : '💡'}] ${s.title}: ${s.description}`)
        .join('\n');
      sections.push(`## 需要关注的事项\n${items}`);
    }
  }

  // 2. User preferences
  if (preferencesRes.status === 'fulfilled' && preferencesRes.value.ok) {
    const prefs = await preferencesRes.value.json() as Record<string, unknown>;
    const prefLines: string[] = [];
    if (prefs.preferredPlatforms && (prefs.preferredPlatforms as string[]).length > 0) {
      prefLines.push(`- 常用平台: ${(prefs.preferredPlatforms as string[]).join(', ')}`);
    }
    if (prefs.contentStylePreferences) {
      prefLines.push(`- 内容风格: ${prefs.contentStylePreferences}`);
    }
    if (prefs.replyStylePreferences) {
      prefLines.push(`- 回复风格: ${prefs.replyStylePreferences}`);
    }
    if (prefs.brandVoice) {
      prefLines.push(`- 品牌调性: ${prefs.brandVoice}`);
    }
    if (prefs.preferredPublishTimes && (prefs.preferredPublishTimes as string[]).length > 0) {
      prefLines.push(`- 偏好发布时间: ${(prefs.preferredPublishTimes as string[]).join(', ')}`);
    }
    if (prefLines.length > 0) {
      sections.push(`## 用户偏好\n${prefLines.join('\n')}`);
    }
  }

  // 3. Active campaigns
  if (campaignsRes.status === 'fulfilled' && campaignsRes.value.ok) {
    const data = await campaignsRes.value.json() as { items?: Array<{ name: string; status: string; publishedCount: number; nextRunAt?: string }> };
    if (data.items?.length) {
      const campaigns = data.items
        .map((c) => `- ${c.name} (已发布${c.publishedCount}篇${c.nextRunAt ? `, 下次: ${new Date(c.nextRunAt).toLocaleString('zh-CN')}` : ''})`)
        .join('\n');
      sections.push(`## 进行中的运营活动\n${campaigns}`);
    }
  }

  // 4. Connected accounts summary
  if (accountsRes.status === 'fulfilled' && accountsRes.value.ok) {
    const accounts = await accountsRes.value.json() as Array<{ platform: string; name: string; status: string; mode: string }>;
    if (accounts.length > 0) {
      const accountSummary = accounts
        .map((a) => `- ${a.platform} (${a.name}): ${a.status}, ${a.mode}`)
        .join('\n');
      sections.push(`## 已连接账号\n${accountSummary}`);
    }
  }

  return sections.length > 0
    ? `\n## 当前运营状态\n\n${sections.join('\n\n')}\n`
    : '';
}
