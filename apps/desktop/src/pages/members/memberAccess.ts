import { useAuth } from '../../hooks/useAuth'
import type { User } from '../../services/auth-turso'

export type TranslateFn = (key: string, params?: Record<string, string | number | boolean>) => string
export type MemberRole = User['role']

export const MEMBER_ROLES: MemberRole[] = ['user', 'manager', 'admin']

export function roleLabel(role: MemberRole, t: TranslateFn): string {
  if (role === 'admin') return t('members.admin')
  if (role === 'manager') return t('members.manager')
  return t('members.user')
}

export function roleAccessLabel(role: MemberRole, t: TranslateFn): string {
  if (role === 'admin') return t('members.fullAccess')
  if (role === 'manager') return t('members.extendedAccess')
  return t('members.basicAccess')
}

/**
 * Role rules for the members screens, unchanged from the previous page:
 * - the page is open to admins, managers and anyone with `users.view`;
 * - creating needs `users.create` (or admin), editing `users.edit` (or admin),
 *   archiving and restoring `users.delete` (or admin);
 * - a manager who is not an admin cannot edit or archive an admin;
 * - nobody archives their own account;
 * - only admins can grant the admin role or reset a password;
 * - PINs can be managed by admins, and by managers for non-admin members.
 */
export function useMemberAccess() {
  const { user, hasRole, hasPermission } = useAuth()
  const isAdmin = hasRole('admin')
  const isManager = hasRole('manager')
  const canManageArchive = hasPermission('users.delete') || isAdmin
  const isProtected = (target: User) => isManager && !isAdmin && target.role === 'admin'
  // Web sessions restore the signed-in user from the JWT payload, which names the id `sub`
  // (sometimes as a number); member rows always carry a string `id`.
  const sessionId = user?.id ?? (user as { sub?: string | number } | null)?.sub
  const currentUserId = sessionId != null ? String(sessionId) : undefined

  return {
    currentUserId,
    canView: Boolean(user) && (isAdmin || isManager || hasPermission('users.view')),
    canCreate: hasPermission('users.create') || isAdmin,
    canViewArchived: canManageArchive,
    canRestore: canManageArchive,
    canResetPassword: isAdmin,
    roleOptions: (isAdmin ? MEMBER_ROLES : MEMBER_ROLES.filter((role) => role !== 'admin')) as MemberRole[],
    canEdit: (target: User) => (hasPermission('users.edit') || isAdmin) && !isProtected(target),
    canArchive: (target: User) => canManageArchive && target.id !== currentUserId && !isProtected(target),
    canEditPin: (target: User | null) => !target || isAdmin || (isManager && target.role !== 'admin'),
  }
}
