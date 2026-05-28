import { OpenClawAdapter } from './openclaw-adapter.js';
import { LocalCliAdapter } from './local-cli-adapter.js';
import type { RuntimeAdapter } from './types.js';

export function getRuntimeAdapter(name: string): RuntimeAdapter {
  if (name === 'local_cli') return new LocalCliAdapter();
  return new OpenClawAdapter();
}
