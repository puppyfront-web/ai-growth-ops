export { encryptToken, decryptToken } from './crypto';
export { getPlatformProvider, getSupportedAuthTypes } from './registry';
export type {
  AuthType,
  PlatformAuthConfig,
  HealthCheckResult,
  PlatformProvider
} from './types';

export const packageMetadata = {
  name: '@ai-growth-ops/providers',
  scope: 'provider'
} as const;
