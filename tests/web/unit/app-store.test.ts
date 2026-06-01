import { describe, it, expect } from 'vitest';
import { useAppStore } from '@/hooks/use-app-store';

describe('useAppStore', () => {
  it('toggles sidebar collapsed state', () => {
    const store = useAppStore.getState();
    expect(store.sidebarCollapsed).toBe(false);

    store.toggleSidebar();
    expect(useAppStore.getState().sidebarCollapsed).toBe(true);

    store.toggleSidebar();
    expect(useAppStore.getState().sidebarCollapsed).toBe(false);
  });

  it('sets sidebar collapsed directly', () => {
    const store = useAppStore.getState();
    store.setSidebarCollapsed(true);
    expect(useAppStore.getState().sidebarCollapsed).toBe(true);

    store.setSidebarCollapsed(false);
    expect(useAppStore.getState().sidebarCollapsed).toBe(false);
  });
});
