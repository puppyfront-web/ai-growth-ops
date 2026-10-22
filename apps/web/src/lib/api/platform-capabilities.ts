import { apiGet } from './client';

export type PlatformCapabilityStatus =
  | 'verified'
  | 'beta'
  | 'unverified'
  | 'unsupported';

export type PlatformCapabilityRow = {
  key: string;
  label: string;
  publish: PlatformCapabilityStatus;
  prospecting: PlatformCapabilityStatus;
  interactionSync: PlatformCapabilityStatus;
  reply: PlatformCapabilityStatus;
  officialApi: PlatformCapabilityStatus;
  note?: string;
};

export function getPlatformCapabilities(): Promise<{
  platforms: PlatformCapabilityRow[];
}> {
  return apiGet('/api/platforms/capabilities');
}
