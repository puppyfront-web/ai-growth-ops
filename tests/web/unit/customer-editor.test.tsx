import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  CHANNEL_LABELS,
  CustomerEditor,
  emptyCustomerForm,
  formFromCustomer,
  type CustomerFormValues
} from '@/components/customers/CustomerEditor';
import type { Customer } from '@/types/customer';

function Harness({ initial }: { initial?: CustomerFormValues }) {
  const [value, setValue] = useState(initial ?? emptyCustomerForm('whatsapp'));
  return (
    <div>
      <CustomerEditor value={value} onChange={setValue} idPrefix="test" />
      <span data-testid="form-email">{value.email ?? ''}</span>
      <span data-testid="form-im">{value.imAccount ?? ''}</span>
      <span data-testid="form-channel">{value.channel}</span>
    </div>
  );
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    organizationId: 'org1',
    userId: 'u1',
    displayName: 'Tom',
    phone: '13800138000',
    email: 'tom@example.com',
    imAccount: '@tom',
    company: 'Acme',
    role: '采购',
    intent: '风扇批发',
    channel: 'whatsapp',
    sourceNote: null,
    status: 'active',
    assignedTo: null,
    nextAction: null,
    nextActionAt: null,
    lastContactedAt: null,
    fitScore: 0,
    intentScore: 0,
    healthScore: 100,
    segment: null,
    tags: [],
    createdAt: '2026-10-23T00:00:00.000Z',
    updatedAt: '2026-10-23T00:00:00.000Z',
    deletedAt: null,
    ...overrides
  } as Customer;
}

describe('CustomerEditor 询盘渠道与联系方式', () => {
  it('渠道下拉包含常用 IM 渠道', () => {
    render(<Harness />);
    const select = screen.getByLabelText('来源渠道') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    for (const channel of [
      'whatsapp',
      'telegram',
      'wechat_personal',
      'email',
      'messenger',
      'instagram',
      'line'
    ]) {
      expect(options).toContain(channel);
      expect(
        CHANNEL_LABELS[channel as keyof typeof CHANNEL_LABELS]
      ).toBeTruthy();
    }
  });

  it('邮箱与 IM 账号可输入并进入表单值', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('邮箱'), 'new@example.com');
    await user.type(screen.getByLabelText('IM 账号'), 'wx_tom');

    expect(screen.getByTestId('form-email').textContent).toBe(
      'new@example.com'
    );
    expect(screen.getByTestId('form-im').textContent).toBe('wx_tom');
  });

  it('formFromCustomer 回填邮箱与 IM 账号', () => {
    const form = formFromCustomer(makeCustomer());
    expect(form.email).toBe('tom@example.com');
    expect(form.imAccount).toBe('@tom');
  });
});
