import { homedir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';

export interface BrowserBridgeArgs {
  apiUrl: string;
  sessionId: string;
  token: string;
}

export function parseBrowserAssistantLaunch(
  value: string,
  trustedOrigins: readonly string[]
): BrowserBridgeArgs {
  const launchUrl = new URL(value);
  if (launchUrl.protocol !== 'aigrowthops:' || launchUrl.hostname !== 'authorize') {
    throw new Error('无效的浏览器助手链接');
  }
  const api = launchUrl.searchParams.get('api');
  const sessionId = launchUrl.searchParams.get('session');
  const token = launchUrl.searchParams.get('token');
  if (!api || !sessionId || !token) throw new Error('浏览器助手链接不完整');
  const apiUrl = new URL(api);
  const normalizedOrigin = apiUrl.origin.toLowerCase();
  const allowed = trustedOrigins.some((origin) => {
    try {
      return new URL(origin).origin.toLowerCase() === normalizedOrigin;
    } catch {
      return false;
    }
  });
  if (!allowed) throw new Error('授权服务地址不受信任');
  if (apiUrl.protocol !== 'https:' && apiUrl.hostname !== 'localhost' && apiUrl.hostname !== '127.0.0.1') {
    throw new Error('授权服务必须使用 HTTPS');
  }
  return {
    apiUrl: apiUrl.toString().replace(/\/$/, ''),
    sessionId,
    token
  };
}

export function mergeTrustedOrigins(
  envValue: string,
  bakedContent: string
): string[] {
  const origins = [
    ...envValue.split(','),
    ...bakedContent.split(/\r?\n/)
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && !value.startsWith('#'));
  return [...new Set(origins)];
}

export function trustedBrowserAssistantOrigins(
  bakedContent = ''
): string[] {
  return mergeTrustedOrigins(
    process.env.BROWSER_ASSISTANT_TRUSTED_ORIGINS ?? '',
    bakedContent
  );
}

export type AssistantNotificationKind =
  | 'launched'
  | 'completed'
  | 'failed';

export function assistantNotification(
  kind: AssistantNotificationKind,
  detail?: string
): { title: string; body: string } {
  if (kind === 'launched') {
    return { title: '浏览器助手', body: '已打开登录页，请在浏览器中完成授权。' };
  }
  if (kind === 'completed') {
    return { title: '浏览器助手', body: '授权完成，凭据已安全保存。' };
  }
  const safeDetail = (detail ?? '未知错误')
    .replace(/token=[^&\s]+/gi, 'token=***')
    .replace(/aigrowthops:\/\/\S+/gi, '授权链接')
    .slice(0, 90);
  return { title: '浏览器助手', body: `授权失败：${safeDetail}` };
}

export function parseBrowserBridgeArgs(args: readonly string[]): BrowserBridgeArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument?.startsWith('--') || argument === '--') continue;
    const value = args[index + 1];
    if (value && !value.startsWith('--')) {
      values.set(argument, value);
      index += 1;
    }
  }
  const required = ['--api', '--session', '--token'] as const;
  const missing = required.filter((name) => !values.get(name));
  if (missing.length > 0) throw new Error(`缺少参数: ${missing.join(', ')}`);
  const apiUrl = new URL(values.get('--api')!);
  if (!['http:', 'https:'].includes(apiUrl.protocol)) {
    throw new Error('--api 必须是 HTTP(S) 地址');
  }
  return {
    apiUrl: apiUrl.toString().replace(/\/$/, ''),
    sessionId: values.get('--session')!,
    token: values.get('--token')!
  };
}

export function defaultBrowserBridgeDataDirectory(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'ai-growth-ops', 'browser-bridge');
  }
  if (process.platform === 'win32') {
    return join(
      process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
      'ai-growth-ops',
      'browser-bridge'
    );
  }
  return join(
    process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'),
    'ai-growth-ops',
    'browser-bridge'
  );
}

export function resolveProfileDirectory(
  dataDirectory: string,
  profileRef: string
): string {
  const segments = profileRef.split(/[\\/]/);
  if (
    isAbsolute(profileRef) ||
    segments.some(
      (segment) => !segment || segment === '.' || segment === '..' || !/^[a-zA-Z0-9_-]+$/.test(segment)
    )
  ) {
    throw new Error('Profile 路径无效');
  }
  const profileRoot = resolve(dataDirectory, 'profiles');
  const profileDirectory = resolve(profileRoot, ...segments);
  if (!profileDirectory.startsWith(`${profileRoot}${sep}`)) {
    throw new Error('Profile 路径无效');
  }
  return profileDirectory;
}

export function assertAllowedNavigation(
  targetUrl: string,
  allowedOrigins: readonly string[]
): void {
  const target = new URL(targetUrl);
  if (['about:', 'chrome:', 'edge:'].includes(target.protocol)) return;
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error(`UNSAFE_REDIRECT: ${target.protocol}`);
  }
  const allowed = allowedOrigins.some((origin) => {
    const allowedHost = new URL(origin).hostname;
    return (
      target.hostname === allowedHost || target.hostname.endsWith(`.${allowedHost}`)
    );
  });
  if (!allowed) throw new Error(`UNSAFE_REDIRECT: ${target.hostname}`);
}
