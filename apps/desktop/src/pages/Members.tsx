import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import {
  Button,
  Dialog,
  DialogConfirm,
  Input,
  PageLoader,
  Pagination,
  PasswordInput,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { authService, type User } from '../services/auth-turso'

interface EditUserModalProps {
  user: User | null
  isOpen: boolean
  onClose: () => void
  onSave: (user: User) => void
}

function EditUserModal({ user, isOpen, onClose, onSave }: EditUserModalProps) {
  const { t } = useTranslation()
  const { hasRole } = useAuth()
  const formPanelClass = 'rounded-cards border border-fog-border bg-chalk p-6 '

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'user' as User['role'],
    password: '',
  })
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (user && isOpen) {
      setFormData({
        name: user.name,
        email: user.email,
        role: user.role,
        password: '',
      })
    } else if (isOpen) {
      setFormData({
        name: '',
        email: '',
        role: 'user',
        password: '',
      })
    }
  }, [user, isOpen])

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      let result: { success: boolean; user?: User; error?: string }
      if (user) {
        const updates: {
          name: string
          email: string
          role: User['role']
          password?: string
        } = {
          name: formData.name,
          email: formData.email,
          role: formData.role,
        }

        // Only include password if admin is resetting it
        if (formData.password && hasRole('admin')) {
          updates.password = formData.password
        }

        result = await authService.updateUser(user.id, updates)
      } else {
        result = await authService.createUser({
          name: formData.name,
          email: formData.email,
          role: formData.role,
          password: formData.password,
        })
      }

      if (result.success && result.user) {
        onSave(result.user)
        onClose()
        toast.success(user ? t('members.userUpdated') : t('members.userCreated'))
      } else {
        toast.error(result.error || t('errors.generic'))
      }
    } catch (_err) {
      toast.error(t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={user ? t('members.editMember') : t('members.addMember')}>
      <div>
        <div class={formPanelClass}>
          <form onSubmit={handleSubmit} class="space-y-6">
            <div>
              <Input
                label={t('members.fullName')}
                value={formData.name}
                onInput={(e) =>
                  setFormData({
                    ...formData,
                    name: (e.target as HTMLInputElement).value,
                  })
                }
                required
                placeholder={t('members.enterFullName')}
              />
            </div>

            <div>
              <Input
                label={t('members.emailAddress')}
                type="email"
                value={formData.email}
                onInput={(e) =>
                  setFormData({
                    ...formData,
                    email: (e.target as HTMLInputElement).value,
                  })
                }
                required
                placeholder={t('members.enterEmail')}
              />
            </div>

            <div>
              <Select
                label={t('members.rolePermissions')}
                value={formData.role}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    role: (e.target as HTMLSelectElement).value as User['role'],
                  })
                }
                options={
                  hasRole('admin')
                    ? [
                        { value: 'user', label: `${t('members.user')} - ${t('members.basicAccess')}` },
                        { value: 'manager', label: `${t('members.manager')} - ${t('members.extendedAccess')}` },
                        { value: 'admin', label: `${t('members.admin')} - ${t('members.fullAccess')}` },
                      ]
                    : [
                        { value: 'user', label: `${t('members.user')} - ${t('members.basicAccess')}` },
                        { value: 'manager', label: `${t('members.manager')} - ${t('members.extendedAccess')}` },
                      ]
                }
              />
            </div>

            {(!user || (user && hasRole('admin')) || (user && hasRole('manager') && user.role !== 'admin')) && (
              <div>
                <PasswordInput
                  label={user ? t('members.resetPassword') : t('auth.password')}
                  value={formData.password}
                  onInput={(e) =>
                    setFormData({
                      ...formData,
                      password: (e.target as HTMLInputElement).value,
                    })
                  }
                  required={!user}
                  placeholder={user ? t('members.leaveBlankKeepCurrent') : t('members.enterNewPassword')}
                  showStrength={!user || formData.password.length > 0}
                  helperText={user ? t('members.passwordResetHint') : undefined}
                />
              </div>
            )}
          </form>
        </div>
      </div>

      <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-fog-border pt-6 ">
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
          {t('common.cancel')}
        </Button>
        <Button type="button" onClick={() => handleSubmit(new Event('submit'))} disabled={isLoading}>
          {isLoading ? t('common.loading') : user ? t('common.edit') : t('common.add')}
        </Button>
      </div>
    </Dialog>
  )
}

export default function Members() {
  const { t } = useTranslation()
  const panelClass = 'rounded-cards border border-fog-border bg-canvas '

  const [users, setUsers] = useState<User[]>([])
  const [deletedUsers, setDeletedUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null)
  const [showDeletedUsers, setShowDeletedUsers] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [pageSize] = useState(10)

  const { user: currentUser, hasRole, hasPermission } = useAuth()

  const canManageUsers = currentUser && (hasRole('admin') || hasRole('manager') || hasPermission('users.view'))

  useEffect(() => {
    if (canManageUsers) {
      loadUsers()
      if (hasPermission('users.delete') || hasRole('admin')) {
        loadDeletedUsers()
      }
    } else if (currentUser) {
      setIsLoading(false)
    }
  }, [showDeletedUsers, canManageUsers, currentUser])

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    loadUsers(page)
  }

  const loadUsers = async (page: number = 1) => {
    if (!canManageUsers) {
      toast.error(t('members.noPermissionMembers'))
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      const paginatedResult = await authService.getUsersPaginated(page, pageSize)
      setUsers(paginatedResult.users)
      setTotalCount(paginatedResult.totalCount)
      setTotalPages(paginatedResult.totalPages)
      setCurrentPage(paginatedResult.currentPage)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load users'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const loadDeletedUsers = async () => {
    if (!canManageUsers || (!hasPermission('users.delete') && !hasRole('admin'))) {
      return
    }

    try {
      const deleted = await authService.getDeletedUsers()
      setDeletedUsers(deleted)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load deleted users'
      toast.error(message)
    }
  }

  const handleCreateUser = () => {
    setEditingUser(null)
    setIsModalOpen(true)
  }

  const handleEditUser = (user: User) => {
    setEditingUser(user)
    setIsModalOpen(true)
  }

  const handleDeleteUser = async (userId: string) => {
    try {
      const result = await authService.deleteUser(userId)
      if (result.success) {
        setDeleteConfirm(null)
        toast.success(t('members.userArchived'))
        // Reload data to reflect changes with proper pagination
        await loadUsers(currentPage)
        if (hasPermission('users.delete') || hasRole('admin')) {
          await loadDeletedUsers()
        }
      } else {
        toast.error(result.error || t('errors.generic'))
      }
    } catch (_err) {
      toast.error(t('errors.generic'))
    }
  }

  const handleRestoreUser = async (userId: string) => {
    try {
      const result = await authService.restoreUser(userId)
      if (result.success) {
        setRestoreConfirm(null)
        toast.success(t('members.userRestored'))
        // Reload both active and deleted users
        await loadUsers(currentPage)
        await loadDeletedUsers()
      } else {
        toast.error(result.error || t('errors.generic'))
      }
    } catch (_err) {
      toast.error(t('errors.generic'))
    }
  }

  const handleSaveUser = async () => {
    // Reload data to reflect changes with proper pagination
    await loadUsers(currentPage)
    setIsModalOpen(false)
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'border border-fog-border bg-chalk text-void '
      case 'manager':
        return 'border border-fog-border bg-chalk text-void '
      case 'user':
        return 'border border-fog-border bg-chalk text-void '
      default:
        return 'border border-fog-border bg-chalk text-void '
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return '👑'
      case 'manager':
        return '👔'
      case 'user':
        return '👤'
      default:
        return '❓'
    }
  }

  if (!canManageUsers) {
    return (
      <div class="max-w-6xl mx-auto">
        <div class={`${panelClass} p-12`}>
          <div class="text-center">
            <div class="text-6xl mb-6 drop-shadow-sm">🔒</div>
            <h2 class="mb-3 text-lg font-semibold text-void ">{t('members.accessDenied')}</h2>
            <p class="mx-auto max-w-md text-graphite ">{t('members.noPermissionMembers')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return <PageLoader message={t('members.loadingMembers')} />
  }

  return (
    <div class="max-w-6xl mx-auto">
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <p class="text-sm text-graphite ">
          {t('members.membersTotal', {
            count: totalCount,
            unit: totalCount === 1 ? t('members.member') : t('members.members'),
          })}
          {totalPages > 1 && ` • ${t('members.pageXofY', { current: currentPage, total: totalPages })}`}
        </p>
        <div class="flex flex-wrap gap-3">
          {(hasPermission('users.delete') || hasRole('admin')) && (
            <Button
              variant="outline"
              onClick={() => setShowDeletedUsers(!showDeletedUsers)}
              class={showDeletedUsers ? 'border-fog-border bg-chalk text-void ' : ''}
            >
              {showDeletedUsers ? t('members.activeUsers') : t('members.archivedUsers')}
              {deletedUsers.length > 0 && !showDeletedUsers && (
                <span class="ml-2 rounded-full bg-chalk px-2 py-1 text-xs text-void ">{deletedUsers.length}</span>
              )}
            </Button>
          )}
          {(hasPermission('users.create') || hasRole('admin')) && (
            <Button onClick={handleCreateUser}>{t('members.addMember')}</Button>
          )}
        </div>
      </div>

      <div class={`${panelClass} overflow-hidden`}>
        <Table striped>
          <TableHead>
            <TableRow class="bg-chalk ">
              <TableHeader class="font-semibold">{t('members.user')}</TableHeader>
              <TableHeader class="font-semibold">{t('members.role')}</TableHeader>
              <TableHeader class="font-semibold">
                {showDeletedUsers ? t('members.archived') : t('members.created')}
              </TableHeader>
              <TableHeader class="font-semibold">{t('members.lastLogin')}</TableHeader>
              <TableHeader class="font-semibold">{t('members.actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {(showDeletedUsers ? deletedUsers : users).map((user, index) => (
              <TableRow
                key={user.id}
                class={showDeletedUsers ? 'bg-chalk ' : ''}
                style={`animation-delay: ${index * 50}ms`}
              >
                <TableCell>
                  <div class="flex items-center">
                    <div
                      class={`mr-4 flex h-10 w-10 items-center justify-center rounded-full text-lg font-semibold ${
                        showDeletedUsers ? 'bg-chalk text-void ' : 'bg-chalk text-void '
                      }`}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div class="flex items-center gap-2 font-semibold text-void ">
                        {user.name}
                        {showDeletedUsers && (
                          <span class="rounded-full bg-chalk px-2 py-1 text-xs font-medium text-void ">Archived</span>
                        )}
                      </div>
                      <div class="text-sm text-graphite ">{user.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div
                    class={`inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
                      showDeletedUsers ? 'border border-fog-border bg-chalk text-graphite ' : getRoleColor(user.role)
                    }`}
                  >
                    <span class="mr-1 text-sm">{getRoleIcon(user.role)}</span>
                    {user.role === 'admin'
                      ? t('members.admin')
                      : user.role === 'manager'
                        ? t('members.manager')
                        : t('members.user')}
                  </div>
                </TableCell>
                <TableCell>
                  <div class="text-sm text-graphite ">
                    <div>
                      {new Date(
                        showDeletedUsers ? (user.deletedAt ?? user.createdAt) : user.createdAt,
                      ).toLocaleDateString()}
                    </div>
                    <div class="text-xs text-graphite ">
                      {new Date(
                        showDeletedUsers ? (user.deletedAt ?? user.createdAt) : user.createdAt,
                      ).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div class="text-sm text-graphite ">
                    {user.lastLogin ? (
                      <>
                        <div>{new Date(user.lastLogin).toLocaleDateString()}</div>
                        <div class="text-xs text-graphite ">
                          {new Date(user.lastLogin).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </>
                    ) : (
                      <div class="italic text-graphite ">{t('members.neverLoggedIn')}</div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div class="flex space-x-2">
                    {showDeletedUsers ? (
                      // Actions for deleted users
                      (hasPermission('users.delete') || hasRole('admin')) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRestoreConfirm(user.id)}
                          class="border-fog-border text-void hover:bg-chalk hover:border-fog-border "
                        >
                          {t('members.restore')}
                        </Button>
                      )
                    ) : (
                      // Actions for active users
                      <>
                        {(hasPermission('users.edit') || hasRole('admin')) &&
                          !(hasRole('manager') && !hasRole('admin') && user.role === 'admin') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditUser(user)}
                              class="mr-2 border-fog-border text-void hover:bg-chalk hover:border-fog-border "
                            >
                              {t('common.edit')}
                            </Button>
                          )}
                        {(hasPermission('users.delete') || hasRole('admin')) &&
                          user.id !== currentUser?.id &&
                          !(hasRole('manager') && !hasRole('admin') && user.role === 'admin') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDeleteConfirm(user.id)}
                              class="border-fog-border text-void hover:bg-chalk hover:border-fog-border "
                            >
                              {t('members.archive')}
                            </Button>
                          )}
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          totalCount={totalCount}
          pageSize={pageSize}
          isLoading={isLoading}
        />
      )}

      {(showDeletedUsers ? deletedUsers : users).length === 0 && (
        <div class={`${panelClass} p-12`}>
          <div class="text-center">
            <div class="text-6xl mb-6">{showDeletedUsers ? '🗂️' : '👥'}</div>
            <h2 class="mb-3 text-lg font-semibold text-void ">
              {showDeletedUsers ? t('members.noArchivedUsers') : t('members.noMembers')}
            </h2>
            <p class="mx-auto mb-6 max-w-md text-graphite ">
              {showDeletedUsers ? t('members.noArchivedUsersDesc') : t('members.emptyTeam')}
            </p>
            {(hasPermission('users.create') || hasRole('admin')) && !showDeletedUsers && (
              <Button onClick={handleCreateUser} class="mt-4">
                {t('members.addFirstMember')}
              </Button>
            )}
          </div>
        </div>
      )}

      <EditUserModal
        user={editingUser}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveUser}
      />

      <DialogConfirm
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDeleteUser(deleteConfirm)}
        title={t('members.archiveUserTitle')}
        message={t('members.archiveUserMessage')}
        confirmText={t('members.archiveUserConfirm')}
        variant="primary"
      />

      <DialogConfirm
        isOpen={!!restoreConfirm}
        onClose={() => setRestoreConfirm(null)}
        onConfirm={() => restoreConfirm && handleRestoreUser(restoreConfirm)}
        title={t('members.restoreUserTitle')}
        message={t('members.restoreUserMessage')}
        confirmText={t('members.restoreUserConfirm')}
        variant="primary"
      />
    </div>
  )
}
