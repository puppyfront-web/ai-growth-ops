import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoundAccountLoginNotice } from '@/components/prospecting/BoundAccountLoginNotice';

describe('BoundAccountLoginNotice', () => {
  it('点名任务绑定的账号并引导重新登录', () => {
    render(
      <BoundAccountLoginNotice
        platformLabel="抖音"
        accountName="黄鸭"
        onLogin={vi.fn()}
      />
    );

    expect(
      screen.getByText(/任务绑定的账号「抖音-黄鸭」需要重新登录/)
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '恢复并扫码登录「黄鸭」' })
    ).toBeTruthy();
  });

  it('点击按钮触发重新登录回调', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    render(
      <BoundAccountLoginNotice
        platformLabel="抖音"
        accountName="黄鸭"
        onLogin={onLogin}
      />
    );

    await user.click(
      screen.getByRole('button', { name: '恢复并扫码登录「黄鸭」' })
    );
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('恢复请求进行中时按钮禁用并显示等待文案', () => {
    render(
      <BoundAccountLoginNotice
        platformLabel="抖音"
        accountName="黄鸭"
        onLogin={vi.fn()}
        pending
      />
    );

    const button = screen.getByRole('button', { name: /恢复中/ });
    expect((button as HTMLInputElement).disabled).toBe(true);
  });
});
