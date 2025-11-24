import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import {
  Button,
  Dialog,
  DialogConfirm,
  Input,
  Pagination,
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
import { authService, type User } from '../services/auth-sqlite'

interface EditUserModalProps {
  user: User | null
  isOpen: boolean
  onClose: () => void
  onSave: (user: User) => void
}

function EditUserModal({ user, isOpen, onClose, onSave }: EditUserModalProps) {
  const { t } = useTranslation()
  const { hasRole } = useAuth()

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
        <div class="bg-white border border-gray-200 rounded-xl p-6">
          <form onSubmit={handleSubmit} class="space-y-6">
            <div>
              <Input
                label={`👤 ${t('members.fullName')}`}
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
                label={`✉️ ${t('members.emailAddress')}`}
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
                label={`👑 ${t('members.rolePermissions')}`}
                value={formData.role}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    role: (e.target as HTMLSelectElement).value as User['role'],
                  })
                }
                options={[
                  { value: 'user', label: `👤 ${t('members.user')} - ${t('members.basicAccess')}` },
                  { value: 'manager', label: `👔 ${t('members.manager')} - ${t('members.extendedAccess')}` },
                  { value: 'admin', label: `👑 ${t('members.admin')} - ${t('members.fullAccess')}` },
                ]}
              />
            </div>

            {(!user || (user && hasRole('admin'))) && (
              <div>
                <Input
                  label={`🔐 ${user ? t('members.resetPassword') : t('auth.password')}`}
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={formData.password}
                  onInput={(e) => {
                    const value = (e.target as HTMLInputElement).value
                    // Only allow digits
                    const numericValue = value.replace(/\D/g, '')
                    setFormData({
                      ...formData,
                      password: numericValue,
                    })
                  }}
                  required={!user}
                  placeholder={user ? t('members.leaveBlankKeepCurrent') : t('members.password6digits')}
                />
                {user && <p class="text-xs text-gray-600 mt-2">{t('members.passwordResetHint')}</p>}
                {!user && <p class="text-xs text-gray-600 mt-2">{t('members.passwordMust6Numbers')}</p>}
              </div>
            )}
          </form>
        </div>
      </div>

      <div class="flex justify-end gap-3 pt-6 border-t border-gray-200">
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

  const [users, setUsers] = useState<User[]>([])
  const [deletedUsers, setDeletedUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null)
  const [hardDeleteConfirm, setHardDeleteConfirm] = useState<string | null>(null)
  const [showDeletedUsers, setShowDeletedUsers] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [pageSize] = useState(10)

  const { user: currentUser, hasRole, hasPermission } = useAuth()

  const canManageUsers = currentUser && (hasRole('admin') || hasRole('manager') || hasPermission('users.view'))

  useEffect(() => {
    loadUsers()
    if (hasPermission('users.delete') || hasRole('admin')) {
      loadDeletedUsers()
    }
  }, [showDeletedUsers])

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

  const handleHardDeleteUser = async (userId: string) => {
    try {
      const result = await authService.hardDeleteUser(userId)
      if (result.success) {
        setHardDeleteConfirm(null)
        toast.success(t('members.userPermanentlyDeleted'))
        // Reload deleted users
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
        return 'bg-gradient-to-r from-red-100 to-red-200 text-red-800 border border-red-300 shadow-sm'
      case 'manager':
        return 'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border border-blue-300 shadow-sm'
      case 'user':
        return 'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border border-green-300 shadow-sm'
      default:
        return 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-800 border border-gray-300 shadow-sm'
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
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
          <div class="text-center">
            <div class="text-6xl mb-6 drop-shadow-lg">🔒</div>
            <h2 class="text-lg font-semibold mb-3 text-gray-900">{t('members.accessDenied')}</h2>
            <p class="text-gray-600 max-w-md mx-auto">{t('members.noPermissionMembers')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div class="max-w-6xl mx-auto">
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
          <div class="text-center">
            <div class="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full animate-spin border-4 border-transparent border-t-white mx-auto mb-6 shadow-lg"></div>
            <p class="text-gray-600 text-lg">{t('members.loadingMembers')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div class="max-w-6xl mx-auto">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 mb-2">{t('members.teamMembers')}</h1>
          <p class="text-gray-600">
            {t('members.membersTotal', {
              count: totalCount,
              unit: totalCount === 1 ? t('members.member') : t('members.members'),
            })}
            {totalPages > 1 && ` • ${t('members.pageXofY', { current: currentPage, total: totalPages })}`}
          </p>
        </div>
        <div class="flex gap-3">
          {(hasPermission('users.delete') || hasRole('admin')) && (
            <Button
              variant="outline"
              onClick={() => setShowDeletedUsers(!showDeletedUsers)}
              class={showDeletedUsers ? 'bg-orange-50 border-orange-200 text-orange-700' : ''}
            >
              {showDeletedUsers ? `👥 ${t('members.activeUsers')}` : `🗂️ ${t('members.archivedUsers')}`}
              {deletedUsers.length > 0 && !showDeletedUsers && (
                <span class="ml-2 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs">
                  {deletedUsers.length}
                </span>
              )}
            </Button>
          )}
          {(hasPermission('users.create') || hasRole('admin')) && (
            <Button onClick={handleCreateUser}>
              <span class="mr-2">➕</span>
              {t('members.addMember')}
            </Button>
          )}
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <Table>
          <TableHead>
            <TableRow class="bg-gray-50">
              <TableHeader class="font-semibold text-gray-900">{t('members.user')}</TableHeader>
              <TableHeader class="font-semibold text-gray-900">{t('members.role')}</TableHeader>
              <TableHeader class="font-semibold text-gray-900">
                {showDeletedUsers ? t('members.archived') : t('members.created')}
              </TableHeader>
              <TableHeader class="font-semibold text-gray-900">{t('members.lastLogin')}</TableHeader>
              <TableHeader class="font-semibold text-gray-900">{t('members.actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {(showDeletedUsers ? deletedUsers : users).map((user, index) => (
              <TableRow
                key={user.id}
                class={`hover:bg-gray-50 transition-all duration-200 hover:shadow-sm ${
                  showDeletedUsers ? 'bg-orange-50/50' : ''
                }`}
                style={`animation-delay: ${index * 50}ms`}
              >
                <TableCell>
                  <div class="flex items-center">
                    <div
                      class={`w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold mr-4 ${
                        showDeletedUsers
                          ? 'bg-gradient-to-br from-orange-500 to-red-600'
                          : 'bg-gradient-to-br from-blue-500 to-purple-600'
                      }`}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div class="font-semibold text-gray-900 flex items-center gap-2">
                        {user.name}
                        {showDeletedUsers && (
                          <span class="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                            Archived
                          </span>
                        )}
                      </div>
                      <div class="text-sm text-gray-600">{user.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div
                    class={`inline-flex items-center px-3 py-2 rounded-full text-xs font-semibold uppercase tracking-wide ${
                      showDeletedUsers ? 'bg-gray-100 text-gray-600 border border-gray-300' : getRoleColor(user.role)
                    } transition-all hover:scale-105`}
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
                  <div class="text-sm text-gray-600">
                    <div>
                      {new Date(
                        showDeletedUsers ? (user.deletedAt ?? user.createdAt) : user.createdAt,
                      ).toLocaleDateString()}
                    </div>
                    <div class="text-xs text-gray-500">
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
                  <div class="text-sm text-gray-600">
                    {user.lastLogin ? (
                      <>
                        <div>{new Date(user.lastLogin).toLocaleDateString()}</div>
                        <div class="text-xs text-gray-500">
                          {new Date(user.lastLogin).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </>
                    ) : (
                      <div class="text-gray-400 italic">{t('members.neverLoggedIn')}</div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div class="flex space-x-2">
                    {showDeletedUsers ? (
                      // Actions for deleted users
                      <>
                        {(hasPermission('users.delete') || hasRole('admin')) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRestoreConfirm(user.id)}
                            class="text-green-600 border-green-200 hover:bg-green-50 hover:border-green-300 transition-all hover:shadow-md"
                          >
                            ↩️ {t('members.restore')}
                          </Button>
                        )}
                        {(hasPermission('users.delete') || hasRole('admin')) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setHardDeleteConfirm(user.id)}
                            class="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 transition-all hover:shadow-md"
                          >
                            ⛔ {t('members.permanentDelete')}
                          </Button>
                        )}
                      </>
                    ) : (
                      // Actions for active users
                      <>
                        {(hasPermission('users.edit') || hasRole('admin')) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditUser(user)}
                            class="text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300 transition-all hover:shadow-md mr-2"
                          >
                            ✏️ {t('common.edit')}
                          </Button>
                        )}
                        {(hasPermission('users.delete') || hasRole('admin')) && user.id !== currentUser?.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDeleteConfirm(user.id)}
                            class="text-orange-600 border-orange-200 hover:bg-orange-50 hover:border-orange-300 transition-all hover:shadow-md"
                          >
                            📁 {t('members.archive')}
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
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
          <div class="text-center">
            <div class="text-6xl mb-6">{showDeletedUsers ? '🗂️' : '👥'}</div>
            <h2 class="text-lg font-semibold mb-3 text-gray-900">
              {showDeletedUsers ? t('members.noArchivedUsers') : t('members.noMembers')}
            </h2>
            <p class="text-gray-600 mb-6 max-w-md mx-auto">
              {showDeletedUsers ? t('members.noArchivedUsersDesc') : t('members.emptyTeam')}
            </p>
            {(hasPermission('users.create') || hasRole('admin')) && !showDeletedUsers && (
              <Button onClick={handleCreateUser} class="mt-4">
                <span class="mr-2">➕</span>
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

      <DialogConfirm
        isOpen={!!hardDeleteConfirm}
        onClose={() => setHardDeleteConfirm(null)}
        onConfirm={() => hardDeleteConfirm && handleHardDeleteUser(hardDeleteConfirm)}
        title={t('members.permanentDeleteTitle')}
        message={`⚠️ ${t('members.permanentDeleteMessage')}`}
        confirmText={t('members.permanentDeleteConfirm')}
        variant="danger"
      />
    </div>
  )
}
