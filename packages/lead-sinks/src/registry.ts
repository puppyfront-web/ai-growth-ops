import type { LeadSink, NotifySink, LeadSinkConfig, LeadData } from './types.js';
import { FeishuBitableSink } from './feishu-bitable.js';
import { FeishuBotSink } from './feishu-bot.js';
import { WeComContactSink } from './wecom-contact.js';
import { WeComAppMessageSink } from './wecom-message.js';

const sinks = new Map<string, LeadSink>();
const notifySinks = new Map<string, NotifySink>();

// Register default sinks
const feishuBitable = new FeishuBitableSink();
const feishuBot = new FeishuBotSink();
const wecomContact = new WeComContactSink();
const wecomAppMessage = new WeComAppMessageSink();

sinks.set('feishu_bitable', feishuBitable);
sinks.set('lark', feishuBitable);
sinks.set('wecom', wecomContact);
sinks.set('wecom_contact', wecomContact);

notifySinks.set('feishu_bot', feishuBot);
notifySinks.set('wecom_app_message', wecomAppMessage);

export function registerSink(sink: LeadSink): void {
  sinks.set(sink.sinkType, sink);
}

export function registerNotifySink(sink: NotifySink): void {
  notifySinks.set(sink.sinkType, sink);
}

export function getSink(sinkType: string): LeadSink | undefined {
  return sinks.get(sinkType);
}

export function getNotifySink(sinkType: string): NotifySink | undefined {
  return notifySinks.get(sinkType);
}

export async function syncLeadToSink(lead: LeadData, sinkType: string, config: LeadSinkConfig): Promise<import('./types.js').SinkResult> {
  const sink = sinks.get(sinkType);
  if (!sink) {
    return { success: false, errorCode: 'SINK_NOT_FOUND', errorMessage: `No sink registered for type: ${sinkType}` };
  }
  return sink.sync(lead, config);
}

export async function notifyViaSink(lead: LeadData, sinkType: string, config: LeadSinkConfig, message?: string): Promise<import('./types.js').SinkResult> {
  const sink = notifySinks.get(sinkType);
  if (!sink) {
    return { success: false, errorCode: 'SINK_NOT_FOUND', errorMessage: `No notify sink registered for type: ${sinkType}` };
  }
  return sink.notify(lead, config, message);
}

export async function testSinkConnection(sinkType: string, config: LeadSinkConfig): Promise<{ success: boolean; message: string }> {
  const sink = sinks.get(sinkType);
  if (!sink || !('testConnection' in sink)) {
    return { success: false, message: `No sink registered for type: ${sinkType}` };
  }
  return (sink as LeadSink).testConnection(config);
}
