import { describe, expect, it } from 'vitest';
import {
  getBrowserRunnerConfig,
  getBrowserRunnerHeaders,
  validatePlatformCookie
} from '@ai-growth-ops/shared';

describe('browser-runner configuration', () => {
  it('falls back to the encryption key when no dedicated runner secret is configured', () => {
    const environment = { TOKEN_ENCRYPTION_KEY: 'shared-secret' };

    expect(getBrowserRunnerConfig(environment)).toEqual({
      url: 'http://localhost:3200',
      secret: 'shared-secret'
    });
    expect(getBrowserRunnerHeaders({}, environment)).toEqual({
      authorization: 'Bearer shared-secret'
    });
  });

  it('requires the login cookie used by each supported platform', () => {
    expect(validatePlatformCookie('douyin', 'sessionid=value; sid_tt=value')).toEqual({
      valid: true,
      cookie: 'sessionid=value; sid_tt=value'
    });
    expect(validatePlatformCookie('douyin', 'ttwid=value')).toEqual({
      valid: false,
      error: 'douyin Cookie 缺少登录字段：sessionid'
    });
  });
});
