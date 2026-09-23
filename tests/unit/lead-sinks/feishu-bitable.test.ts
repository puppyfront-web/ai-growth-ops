import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeishuBitableSink } from '../../../packages/lead-sinks/src/feishu-bitable.js';

describe('FeishuBitableSink', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a row then updates the same record id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ tenant_access_token: 'token' })
      })
      .mockResolvedValueOnce({
        json: async () => ({
          code: 0,
          data: { record: { record_id: 'rec-1' } }
        })
      })
      .mockResolvedValueOnce({
        json: async () => ({ tenant_access_token: 'token' })
      })
      .mockResolvedValueOnce({
        json: async () => ({ code: 0, data: { record: {} } })
      });
    vi.stubGlobal('fetch', fetchMock);

    const sink = new FeishuBitableSink();
    const lead = {
      id: 'cust-1',
      sourcePlatform: '抖音',
      level: 'A',
      createdAt: new Date('2026-01-01T00:00:00.000Z')
    };
    const config = {
      appId: 'cli',
      appSecret: 'secret',
      appToken: 'bascn',
      tableId: 'tbl'
    };

    const created = await sink.sync(lead, config);
    expect(created.externalId).toBe('rec-1');
    expect(created.externalUrl).toContain('record=rec-1');
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('/rec-1');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' });

    const updated = await sink.sync(lead, {
      ...config,
      existingRecordId: 'rec-1'
    });
    expect(updated.externalId).toBe('rec-1');
    expect(String(fetchMock.mock.calls[3][0])).toContain('/records/rec-1');
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ method: 'PUT' });
  });
});
