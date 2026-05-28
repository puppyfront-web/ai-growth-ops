export type HealthStatus = 'ok';

export type AppName =
  | 'web'
  | 'api'
  | 'worker'
  | 'provider-gateway'
  | 'browser-runner'
  | 'research-runner';

export interface AppHealthSnapshot {
  name: AppName;
  status: HealthStatus;
  timestamp: string;
}

export const createHealthSnapshot = (name: AppName): AppHealthSnapshot => ({
  name,
  status: 'ok',
  timestamp: new Date().toISOString()
});
