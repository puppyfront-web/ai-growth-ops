export type HealthStatus = 'ok';

export type AppName =
  | 'web'
  | 'api'
  | 'worker'
  | 'browser-runner';

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
