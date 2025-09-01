import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import {
  Button,
  Container,
  Dialog,
  DialogBody,
  DialogConfirm,
  DialogFooter,
  Heading,
  Input,
  Pagination,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
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
        result = await authService.updateUser(user.id, {
          name: formData.name,
          email: formData.email,
          role: formData.role,
        })
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
    <Dialog isOpen={isOpen} onClose={onClose} title={user ? t('members.editMember') : t('members.addMember')} size="md">
      <DialogBody>

        <div class="backdrop-blur-lg bg-gradient-to-br from-blue-50/60 to-indigo-50/40 border border-blue-200/50 rounded-2xl p-6 shadow-xl">
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
                class="bg-white/80 text-gray-900"
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
                class="bg-white/80 text-gray-900"
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
                class="bg-white/80"
              />
            </div>

            {!user && (
              <div>
                <Input
                  label={`🔐 ${t('auth.password')}`}
                  type="password"
                  value={formData.password}
                  onInput={(e) =>
                    setFormData({
                      ...formData,
                      password: (e.target as HTMLInputElement).value,
                    })
                  }
                  required
                  placeholder={t('members.passwordMin')}
                  class="bg-white/80 text-gray-900"
                />
              </div>
            )}
          </form>
        </div>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
          {t('common.cancel')}
        </Button>
        <Button type="button" onClick={() => handleSubmit(new Event('submit'))} disabled={isLoading}>
          {isLoading ? t('common.loading') : user ? t('common.edit') : t('common.add')}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

export default function Members() {
  const { t } = useTranslation()

  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [pageSize] = useState(10)

  const { user: currentUser, hasRole, hasPermission } = useAuth()

  const canManageUsers = currentUser && (hasRole('admin') || hasRole('manager') || hasPermission('users.view'))

  useEffect(() => {
    loadUsers()
  }, [])

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
        toast.success(t('members.userDeleted'))
        // Reload data to reflect changes with proper pagination
        await loadUsers(currentPage)
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
      <Container size="xl">
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
          <div class="text-center">
            <div class="text-6xl mb-6 drop-shadow-lg">🔒</div>
            <Heading level={3} class="mb-3 text-gray-900">
              {t('members.accessDenied')}
            </Heading>
            <Text class="text-gray-600 max-w-md mx-auto">{t('members.noPermissionMembers')}</Text>
          </div>
        </div>
      </Container>
    )
  }

  if (isLoading) {
    return (
      <Container size="xl">
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
          <div class="text-center">
            <div class="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full animate-spin border-4 border-transparent border-t-white mx-auto mb-6 shadow-lg"></div>
            <Text class="text-gray-600 text-lg">{t('members.loadingMembers')}</Text>
          </div>
        </div>
      </Container>
    )
  }

  return (
    <Container size="xl">
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
        {(hasPermission('users.create') || hasRole('admin')) && (
          <Button onClick={handleCreateUser}>
            <span class="mr-2">➕</span>
            {t('members.addMember')}
          </Button>
        )}
      </div>


      <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <Table>
          <TableHead>
            <TableRow class="bg-gray-50">
              <TableHeader class="font-semibold text-gray-900">{t('members.user')}</TableHeader>
              <TableHeader class="font-semibold text-gray-900">{t('members.role')}</TableHeader>
              <TableHeader class="font-semibold text-gray-900">{t('members.created')}</TableHeader>
              <TableHeader class="font-semibold text-gray-900">{t('members.lastLogin')}</TableHeader>
              <TableHeader class="font-semibold text-gray-900">{t('members.actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user, index) => (
              <TableRow
                key={user.id}
                class="hover:bg-gray-50 transition-all duration-200 hover:shadow-sm"
                style={`animation-delay: ${index * 50}ms`}
              >
                <TableCell>
                  <div class="flex items-center">
                    <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-lg font-bold mr-4">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div class="font-semibold text-gray-900">{user.name}</div>
                      <div class="text-sm text-gray-600">{user.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div
                    class={`inline-flex items-center px-3 py-2 rounded-full text-xs font-semibold uppercase tracking-wide ${getRoleColor(user.role)} transition-all hover:scale-105`}
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
                    <div>{new Date(user.createdAt).toLocaleDateString()}</div>
                    <div class="text-xs text-gray-500">
                      {new Date(user.createdAt).toLocaleTimeString([], {
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
                    {(hasPermission('users.delete') || hasRole('admin')) &&
                      user.id !== currentUser?.id &&
                      user.role !== 'admin' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDeleteConfirm(user.id)}
                          class="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 transition-all hover:shadow-md"
                        >
                          🗑️ {t('common.delete')}
                        </Button>
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

      {users.length === 0 && (
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
          <div class="text-center">
            <div class="text-6xl mb-6">👥</div>
            <Heading level={3} class="mb-3 text-gray-900">
              {t('members.noMembers')}
            </Heading>
            <Text class="text-gray-600 mb-6 max-w-md mx-auto">{t('members.emptyTeam')}</Text>
            {(hasPermission('users.create') || hasRole('admin')) && (
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
        title={t('members.confirmDelete')}
        message={t('members.deleteMessage')}
        confirmText={t('common.delete')}
        variant="danger"
      />
    </Container>
  )
}
