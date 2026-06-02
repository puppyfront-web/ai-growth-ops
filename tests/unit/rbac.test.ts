import { describe, it, expect } from 'vitest';
import { hasPermission, hasAnyPermission, hasAllPermissions, getRolePermissions } from '../../apps/api/src/middleware/rbac.js';

describe('RBAC - hasPermission', () => {
  it('owner has all permissions', () => {
    expect(hasPermission('owner', 'content:create')).toBe(true);
    expect(hasPermission('owner', 'team:manage')).toBe(true);
    expect(hasPermission('owner', 'settings:manage')).toBe(true);
    expect(hasPermission('owner', 'webhook:manage')).toBe(true);
  });

  it('admin has all permissions', () => {
    expect(hasPermission('admin', 'content:create')).toBe(true);
    expect(hasPermission('admin', 'team:manage')).toBe(true);
    expect(hasPermission('admin', 'settings:manage')).toBe(true);
  });

  it('member can create content and publish', () => {
    expect(hasPermission('member', 'content:create')).toBe(true);
    expect(hasPermission('member', 'content:edit')).toBe(true);
    expect(hasPermission('member', 'content:delete')).toBe(true);
    expect(hasPermission('member', 'content:publish')).toBe(true);
  });

  it('member can view leads and export', () => {
    expect(hasPermission('member', 'lead:view')).toBe(true);
    expect(hasPermission('member', 'lead:edit')).toBe(true);
    expect(hasPermission('member', 'lead:export')).toBe(true);
  });

  it('member cannot manage team', () => {
    expect(hasPermission('member', 'team:manage')).toBe(false);
  });

  it('member cannot manage settings', () => {
    expect(hasPermission('member', 'settings:manage')).toBe(false);
  });

  it('member cannot manage webhooks', () => {
    expect(hasPermission('member', 'webhook:manage')).toBe(false);
  });

  it('viewer can only view', () => {
    expect(hasPermission('viewer', 'lead:view')).toBe(true);
    expect(hasPermission('viewer', 'interaction:view')).toBe(true);
    expect(hasPermission('viewer', 'analytics:view')).toBe(true);
  });

  it('viewer cannot create or delete content', () => {
    expect(hasPermission('viewer', 'content:create')).toBe(false);
    expect(hasPermission('viewer', 'content:delete')).toBe(false);
    expect(hasPermission('viewer', 'content:publish')).toBe(false);
  });

  it('viewer cannot export', () => {
    expect(hasPermission('viewer', 'lead:export')).toBe(false);
    expect(hasPermission('viewer', 'analytics:export')).toBe(false);
  });

  it('unknown role has no permissions', () => {
    expect(hasPermission('guest', 'content:create')).toBe(false);
    expect(hasPermission('', 'lead:view')).toBe(false);
  });
});

describe('RBAC - hasAnyPermission', () => {
  it('returns true if any permission matches', () => {
    expect(hasAnyPermission('viewer', ['content:delete', 'lead:view', 'settings:manage'])).toBe(true);
  });

  it('returns false if none match', () => {
    expect(hasAnyPermission('viewer', ['content:delete', 'team:manage', 'settings:manage'])).toBe(false);
  });
});

describe('RBAC - hasAllPermissions', () => {
  it('returns true if all permissions match', () => {
    expect(hasAllPermissions('member', ['content:create', 'content:edit', 'lead:view'])).toBe(true);
  });

  it('returns false if any is missing', () => {
    expect(hasAllPermissions('member', ['content:create', 'team:manage'])).toBe(false);
  });
});

describe('RBAC - getRolePermissions', () => {
  it('returns null for owner (wildcard)', () => {
    expect(getRolePermissions('owner')).toBeNull();
  });

  it('returns null for admin (wildcard)', () => {
    expect(getRolePermissions('admin')).toBeNull();
  });

  it('returns permission array for member', () => {
    const perms = getRolePermissions('member');
    expect(perms).not.toBeNull();
    expect(perms!.length).toBeGreaterThan(5);
    expect(perms).toContain('content:create');
  });

  it('returns empty array for unknown role', () => {
    expect(getRolePermissions('unknown')).toEqual([]);
  });
});
