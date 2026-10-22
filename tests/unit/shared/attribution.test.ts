import { describe, expect, it } from 'vitest';
import {
  attributeRevenue,
  type AttributionDeal,
  type AttributionTouch
} from '../../../packages/shared/src/attribution';

const deal: AttributionDeal = {
  id: 'deal-1',
  customerId: 'customer-1',
  amount: 300,
  wonAt: '2026-10-10T00:00:00.000Z'
};

const touches: AttributionTouch[] = [
  {
    id: 't1',
    customerId: 'customer-1',
    channel: 'douyin',
    contentItemId: 'content-1',
    occurredAt: '2026-10-01T00:00:00.000Z'
  },
  {
    id: 't2',
    customerId: 'customer-1',
    channel: 'wecom',
    occurredAt: '2026-10-05T00:00:00.000Z'
  },
  {
    id: 't3',
    customerId: 'customer-1',
    channel: 'manual',
    occurredAt: '2026-10-09T00:00:00.000Z'
  },
  {
    id: 'after',
    customerId: 'customer-1',
    channel: 'email',
    occurredAt: '2026-10-20T00:00:00.000Z'
  }
];

describe('attributeRevenue', () => {
  it('attributes to the first touch', () => {
    const result = attributeRevenue([deal], touches, 'first_touch');
    expect(result.byChannel[0]).toMatchObject({
      channel: 'douyin',
      revenue: 300
    });
    expect(result.unattributedRevenue).toBe(0);
  });

  it('attributes to the last touch before the win', () => {
    const result = attributeRevenue([deal], touches, 'last_touch');
    expect(result.byChannel[0]).toMatchObject({
      channel: 'manual',
      revenue: 300
    });
  });

  it('splits revenue linearly across touches before the win', () => {
    const result = attributeRevenue([deal], touches, 'linear');
    const byChannel = Object.fromEntries(
      result.byChannel.map((row) => [row.channel, row.revenue])
    );
    expect(byChannel.douyin).toBe(100);
    expect(byChannel.wecom).toBe(100);
    expect(byChannel.manual).toBe(100);
    expect(byChannel.email).toBeUndefined();
  });

  it('leaves deals without touches unattributed', () => {
    const result = attributeRevenue(
      [{ ...deal, id: 'deal-2', customerId: 'unknown' }],
      touches,
      'last_touch'
    );
    expect(result.attributedRevenue).toBe(0);
    expect(result.unattributedRevenue).toBe(300);
    expect(result.byChannel).toEqual([]);
  });

  it('aggregates multiple deals and ignores zero amounts', () => {
    const result = attributeRevenue(
      [
        deal,
        {
          id: 'deal-2',
          customerId: 'customer-1',
          amount: 100,
          wonAt: '2026-10-11T00:00:00.000Z'
        },
        {
          id: 'deal-3',
          customerId: 'customer-1',
          amount: 0,
          wonAt: '2026-10-12T00:00:00.000Z'
        }
      ],
      touches,
      'first_touch'
    );
    expect(result.totalRevenue).toBe(400);
    expect(result.byChannel[0]?.revenue).toBe(400);
    expect(result.byChannel[0]?.deals).toBe(3);
  });

  it('attributes content revenue', () => {
    const result = attributeRevenue([deal], touches, 'first_touch');
    expect(result.byContent[0]).toMatchObject({
      contentItemId: 'content-1',
      revenue: 300
    });
  });

  it('handles empty input', () => {
    const result = attributeRevenue([], [], 'linear');
    expect(result.totalRevenue).toBe(0);
    expect(result.unattributedRevenue).toBe(0);
    expect(result.byChannel).toEqual([]);
  });
});
