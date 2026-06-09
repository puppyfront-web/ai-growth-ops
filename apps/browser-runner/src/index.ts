import { createHealthSnapshot } from '@ai-growth-ops/shared';

export const appName = 'browser-runner';

export const getBrowserRunnerHealth = () => createHealthSnapshot(appName);

export { startBrowserRunnerServer, createBrowserRunnerServer } from './server';
export { routeRequest } from './routes';
export { sessionManager } from './session-manager';
export {
  getPlatformLoginConfig,
  getSupportedPlatforms
} from './platform-configs';
