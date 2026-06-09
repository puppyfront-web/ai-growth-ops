/**
 * Webhook Service
 *
 * Fires HTTP POST requests to registered webhook URLs when events occur.
 * Webhooks are stored as AppConfig entries with key pattern: webhook_<timestamp>
 * Value format: { url: string, events: string[], secret: string, active: boolean }
 */

import { createHmac } from 'crypto';
import type { DatabaseClient } from '@ai-growth-ops/database';

interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
}

interface WebhookDeliveryLog {
  webhookId: string;
  eventType: string;
  statusCode?: number;
  error?: string;
  durationMs: number;
  timestamp: Date;
}

// In-memory delivery log (last 100 entries per org for diagnostics)
const deliveryLogs = new Map<string, WebhookDeliveryLog[]>();
const MAX_LOGS_PER_ORG = 100;

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 5000, 15000]; // 1s, 5s, 15s

/**
 * Fire a webhook event to all matching subscribers in an organization
 */
export async function fireWebhook(
  db: DatabaseClient,
  organizationId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const webhookConfigs = await getActiveWebhooks(db, organizationId);
    const matching = webhookConfigs.filter(
      (wh) => wh.events.includes('*') || wh.events.includes(eventType)
    );

    if (matching.length === 0) return;

    // Fire all webhooks concurrently (don't block the caller)
    await Promise.allSettled(
      matching.map((wh) =>
        deliverWebhook(wh, eventType, payload, organizationId)
      )
    );
  } catch (err) {
    // Webhook failures should never break the main flow
    console.error(`[WebhookService] Error firing ${eventType}:`, err);
  }
}

/**
 * Get all active webhook configs for an organization
 */
async function getActiveWebhooks(
  db: DatabaseClient,
  organizationId: string
): Promise<WebhookConfig[]> {
  const records = await db.appConfig.findMany({
    where: {
      organizationId,
      key: { startsWith: 'webhook_' }
    }
  });

  return records
    .map((r) => {
      const value = r.value as Record<string, unknown>;
      return {
        id: r.id,
        url: value.url as string,
        events: (value.events as string[]) || [],
        secret: (value.secret as string) || '',
        active: value.active !== false
      };
    })
    .filter((wh) => wh.active && wh.url);
}

/**
 * Deliver a single webhook with retry logic
 */
async function deliverWebhook(
  config: WebhookConfig,
  eventType: string,
  payload: Record<string, unknown>,
  organizationId: string,
  attempt = 0
): Promise<void> {
  const start = Date.now();
  const body = JSON.stringify({
    event: eventType,
    timestamp: new Date().toISOString(),
    data: payload
  });

  const signature = config.secret
    ? createHmac('sha256', config.secret).update(body).digest('hex')
    : undefined;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': eventType,
    'X-Webhook-Delivery': `${config.id}-${Date.now()}`
  };
  if (signature) {
    headers['X-Webhook-Signature'] = `sha256=${signature}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal
    });

    clearTimeout(timeout);

    logDelivery(organizationId, {
      webhookId: config.id,
      eventType,
      statusCode: response.status,
      durationMs: Date.now() - start,
      timestamp: new Date()
    });

    if (!response.ok && attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAYS_MS[attempt] || 15000);
      return deliverWebhook(
        config,
        eventType,
        payload,
        organizationId,
        attempt + 1
      );
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    logDelivery(organizationId, {
      webhookId: config.id,
      eventType,
      error: errorMessage,
      durationMs: Date.now() - start,
      timestamp: new Date()
    });

    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAYS_MS[attempt] || 15000);
      return deliverWebhook(
        config,
        eventType,
        payload,
        organizationId,
        attempt + 1
      );
    }

    console.error(
      `[WebhookService] Failed to deliver ${eventType} to ${config.url} after ${attempt + 1} attempts: ${errorMessage}`
    );
  }
}

/**
 * Get recent delivery logs for an organization (diagnostics)
 */
export function getDeliveryLogs(organizationId: string): WebhookDeliveryLog[] {
  return deliveryLogs.get(organizationId) || [];
}

/**
 * Log a webhook delivery
 */
function logDelivery(organizationId: string, log: WebhookDeliveryLog): void {
  const logs = deliveryLogs.get(organizationId) || [];
  logs.push(log);
  if (logs.length > MAX_LOGS_PER_ORG) {
    logs.splice(0, logs.length - MAX_LOGS_PER_ORG);
  }
  deliveryLogs.set(organizationId, logs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
