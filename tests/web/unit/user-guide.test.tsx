import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: currentUserId, email: 'test@example.com', name: '测试用户' }
  })
}));

let currentUserId = 'user-1';

import {
  UserGuide,
  USER_GUIDE_REOPEN_EVENT,
  getUserGuideStorageKey
} from '@/components/shared/UserGuide';
import { navItems } from '@/components/layout/navigation';

const STORAGE_KEY = getUserGuideStorageKey('user-1');
const VISIBLE_NAV_COUNT = navItems.filter((item) => !item.hidden).length;
const TOTAL_STEPS = VISIBLE_NAV_COUNT + 5;

function getAdvanceButton() {
  return screen.getByRole('button', { name: /开始引导|下一步/ });
}

async function advanceToFinish(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < TOTAL_STEPS - 1; i += 1) {
    await user.click(getAdvanceButton());
  }
}

describe('UserGuide', () => {
  beforeEach(() => {
    currentUserId = 'user-1';
    localStorage.clear();
  });

  it('stays hidden when the user already completed the guide', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { container } = render(<UserGuide />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('starts automatically on first visit with the welcome step', () => {
    render(<UserGuide />);
    expect(screen.getByText('欢迎使用 AI Growth Ops')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '开始引导' })
    ).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: '开始引导' })).toHaveFocus();
  });

  it('keeps keyboard focus inside the dialog', async () => {
    const user = userEvent.setup();
    render(<UserGuide />);

    await user.tab();
    expect(screen.getByRole('button', { name: '跳过引导' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: '开始引导' })).toHaveFocus();
  });

  it('introduces every visible nav module during the walkthrough', async () => {
    const user = userEvent.setup();
    render(<UserGuide />);

    const seenTitles = new Set<string>();
    for (let i = 0; i < TOTAL_STEPS; i += 1) {
      seenTitles.add(
        screen.getByRole('heading', { level: 3 }).textContent ?? ''
      );
      if (i < TOTAL_STEPS - 1) {
        await user.click(getAdvanceButton());
      }
    }

    for (const item of navItems.filter((nav) => !nav.hidden)) {
      expect(seenTitles.has(item.label)).toBe(true);
    }
  });

  it('reaches the finish step and persists completion', async () => {
    const user = userEvent.setup();
    render(<UserGuide />);

    await advanceToFinish(user);
    expect(screen.getByText('引导完成')).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    await user.click(screen.getByRole('button', { name: '完成' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('goes back to the previous step', async () => {
    const user = userEvent.setup();
    render(<UserGuide />);

    await user.click(screen.getByRole('button', { name: '开始引导' }));
    expect(screen.getByRole('heading', { name: '主导航' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '下一步' }));
    const firstNavLabel = navItems.find((nav) => !nav.hidden)!.label;
    expect(
      screen.getByRole('heading', { name: firstNavLabel })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '上一步' }));
    expect(screen.getByRole('heading', { name: '主导航' })).toBeInTheDocument();
  });

  it('skipping the guide persists completion so it does not nag', async () => {
    const user = userEvent.setup();
    render(<UserGuide />);

    await user.click(screen.getByRole('button', { name: '跳过引导' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('finishes on Escape key', async () => {
    const user = userEvent.setup();
    render(<UserGuide />);

    await user.keyboard('{Escape}');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reopens via the reopen event even after completion', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    render(<UserGuide />);
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent(USER_GUIDE_REOPEN_EVENT));
    });
    expect(screen.getByText('欢迎使用 AI Growth Ops')).toBeInTheDocument();
  });

  it('does not auto-start again after finishing within the session', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<UserGuide />);

    await user.click(screen.getByRole('button', { name: '跳过引导' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(<UserGuide />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes an active guide when switching to a user who completed it', () => {
    localStorage.setItem(getUserGuideStorageKey('user-2'), 'true');
    const { rerender } = render(<UserGuide />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    currentUserId = 'user-2';
    rerender(<UserGuide />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
