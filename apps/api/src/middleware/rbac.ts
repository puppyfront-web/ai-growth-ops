/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Permission matrix defining what each role can do.
 * Used as a guard in route handlers.
 */

// ── Permission definitions ───────────────────────────────────────────────

export type Permission =
  // Content
  | 'content:create'
  | 'content:edit'
  | 'content:delete'
  | 'content:publish'
  // Leads
  | 'lead:view'
  | 'lead:edit'
  | 'lead:export'
  // Interactions
  | 'interaction:view'
  | 'interaction:reply'
  // Analytics
  | 'analytics:view'
  | 'analytics:export'
  // Research
  | 'research:create'
  | 'research:view'
  // Settings
  | 'settings:manage'
  | 'team:manage'
  | 'integration:manage'
  // Media
  | 'media:upload'
  | 'media:generate'
  // Webhooks
  | 'webhook:manage';

// ── Role-Permission matrix ───────────────────────────────────────────────

const ROLE_PERMISSIONS: Record<string, Permission[] | '*'> = {
  owner: '*', // All permissions
  admin: '*', // All permissions
  member: [
    'content:create',
    'content:edit',
    'content:delete',
    'content:publish',
    'lead:view',
    'lead:edit',
    'lead:export',
    'interaction:view',
    'interaction:reply',
    'analytics:view',
    'analytics:export',
    'research:create',
    'research:view',
    'media:upload',
    'media:generate'
  ],
  viewer: [
    'content:edit',
    'lead:view',
    'interaction:view',
    'analytics:view',
    'research:view'
  ]
};

// ── Permission checker ───────────────────────────────────────────────────

/**
 * Check if a role has a specific permission.
 * Owner/admin roles have wildcard access.
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (perms === '*') return true;
  return perms.includes(permission);
}

/**
 * Check if a role has ANY of the specified permissions.
 */
export function hasAnyPermission(
  role: string,
  permissions: Permission[]
): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * Check if a role has ALL of the specified permissions.
 */
export function hasAllPermissions(
  role: string,
  permissions: Permission[]
): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

/**
 * Get all permissions for a role (for frontend display).
 * Returns null for wildcard roles (owner/admin).
 */
export function getRolePermissions(role: string): Permission[] | null {
  const perms = ROLE_PERMISSIONS[role];
  if (perms === '*') return null; // All permissions
  if (!perms) return [];
  return perms;
}
