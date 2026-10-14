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
const visibleModules = navItems.filter((item) => !item.hidden);

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

  it('auto-opens on first visit as a single-screen module overview', () => {
    render(<UserGuide />);
    expect(
      screen.getByRole('dialog', { name: '功能引导' })
    ).toBeInTheDocument();
    expect(screen.getByText('欢迎使用 AI Growth Ops')).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: '开始使用' })).toHaveFocus();
  });

  it('introduces every visible nav module on one screen', () => {
    render(<UserGuide />);
    for (const item of visibleModules) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
  });

  it('persists completion and closes when clicking the primary action', async () => {
    const user = userEvent.setup();
    render(<UserGuide />);

    await user.click(screen.getByRole('button', { name: '开始使用' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape key', async () => {
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

    await user.click(screen.getByRole('button', { name: '开始使用' }));
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
