export type AuthType = 'official_api' | 'oauth' | 'cookie' | 'manual';

export interface PlatformAuthConfig {
  authType: AuthType;
  accessToken?: string;
  refreshToken?: string;
  cookie?: string;
  appId?: string;
  appSecret?: string;
}

export interface HealthCheckResult {
  valid: boolean;
  platform: string;
  error?: string;
  expiresAt?: string;
}

export interface PlatformProvider {
  readonly platform: string;
  readonly supportedAuthTypes: readonly AuthType[];
  validateCredentials(config: PlatformAuthConfig): Promise<HealthCheckResult>;
}
