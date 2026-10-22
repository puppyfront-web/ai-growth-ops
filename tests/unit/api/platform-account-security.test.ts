import { describe, expect, it } from 'vitest';
import { decryptToken } from '@ai-growth-ops/providers';
import {
  buildPlatformAccountMetadata,
  toPlatformAccountDto
} from '../../../apps/api/src/platform-account-security';

describe('platform account response security', () => {
  it('returns presence flags without credential material', () => {
    const dto = toPlatformAccountDto({
      id: 'account-1',
      organizationId: 'org-1',
      userId: 'user-1',
      platform: 'douyin',
      name: '主账号',
      mode: 'browser_assist',
      status: 'active',
      accessTokenEncrypted: 'encrypted-access',
      refreshTokenEncrypted: 'encrypted-refresh',
      cookieRef: 'encrypted-cookie',
      metadata: {
        clientKey: 'public-key',
        clientSecret: 'legacy-plain-secret',
        clientSecretEncrypted: 'encrypted-secret',
        apiToken: 'legacy-token',
        syncConfig: {
          enabled: true,
          credential: { cookie: 'nested-cookie' }
        }
      }
    });

    expect(dto).toMatchObject({
      id: 'account-1',
      hasAccessToken: true,
      hasRefreshToken: true,
      hasCookie: true,
      hasSecretConfig: true,
      metadata: {
        clientKey: 'public-key',
        syncConfig: { enabled: true }
      }
    });
    expect(JSON.stringify(dto)).not.toContain('encrypted-access');
    expect(JSON.stringify(dto)).not.toContain('encrypted-cookie');
    expect(JSON.stringify(dto)).not.toContain('plain-secret');
    expect(JSON.stringify(dto)).not.toContain('legacy-token');
    expect(JSON.stringify(dto)).not.toContain('nested-cookie');
    expect(dto).not.toHaveProperty('accessTokenEncrypted');
    expect(dto).not.toHaveProperty('cookieRef');
  });

  it('encrypts secret metadata and preserves public metadata', () => {
    const metadata = buildPlatformAccountMetadata({
      metadata: {
        appId: 'wx-app',
        appSecret: 'wx-secret',
        clientKey: 'douyin-key',
        clientSecret: 'douyin-secret'
      }
    });

    expect(metadata.appId).toBe('wx-app');
    expect(metadata.clientKey).toBe('douyin-key');
    expect(metadata).not.toHaveProperty('appSecret');
    expect(metadata).not.toHaveProperty('clientSecret');
    expect(decryptToken(String(metadata.appSecretEncrypted))).toBe('wx-secret');
    expect(decryptToken(String(metadata.clientSecretEncrypted))).toBe(
      'douyin-secret'
    );
  });
});
