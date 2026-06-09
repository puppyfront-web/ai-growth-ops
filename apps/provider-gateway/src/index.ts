import { createHealthSnapshot } from '@ai-growth-ops/shared';

export const appName = 'provider-gateway';
export const getProviderGatewayHealth = () => createHealthSnapshot(appName);

export {
  createProviderGatewayServer,
  startProviderGatewayServer
} from './server.js';
export { routeRequest } from './routes.js';
