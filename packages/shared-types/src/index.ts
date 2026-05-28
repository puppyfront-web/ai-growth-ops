export type RuntimeIntent =
  | 'publish'
  | 'interaction.fetch'
  | 'interaction.reply'
  | 'lead.extract'
  | 'skill.lifecycle';

export interface RuntimeRequest {
  requestId: string;
  intent: RuntimeIntent;
  payload: Record<string, unknown>;
}

export function createRuntimeRequest(input: RuntimeRequest): RuntimeRequest {
  return input;
}
