import { useEffect, useMemo, useState } from 'preact/hooks'
import { toast } from 'sonner'
import {
  Button,
  DialogConfirm,
  Dropdown,
  type DropdownItem,
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
  VirtualKeypad,
} from '../components/ui'
import { ChevronLeftIcon } from '../components/ui/icons'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { validatePin } from '../lib/password'
import { authService, type User } from '../services/auth-turso'

interface MemberFormPageProps {
  user: User | null
  onBack: () => void
  onSaved: (user: User) => void
}

interface MemberFormData {
  name: string
  email: string
  role: User['role']
  password: string
  pinEnabled: boolean
  pin: string
  pinConfirm: string
}

function digitsOnly(value: string, max = 6): string {
  return value.replace(/\D/g, '').slice(0, max)
}

function serializeMemberForm(formData: MemberFormData): string {
  return JSON.stringify(formData)
}

function MemberFormPage({ user, onBack, onSaved }: MemberFormPageProps) {
  const { t } = useTranslation()
  const { hasRole } = useAuth()
  const formPanelClass = 'rounded-cards border border-fog-border bg-canvas p-6'

  const [formData, setFormData] = useState<MemberFormData>({
    name: '',
    email: '',
    role: 'user',
    password: '',
    pinEnabled: false,
    pin: '',
    pinConfirm: '',
  })
  const [initialFormSnapshot, setInitialFormSnapshot] = useState(() =>
    serializeMemberForm({
      name: '',
      email: '',
      role: 'user',
      password: '',
      pinEnabled: false,
      pin: '',
      pinConfirm: '',
    }),
  )
  const [isLoading, setIsLoading] = useState(false)
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
  const [pinField, setPinField] = useState<'pin' | 'pinConfirm'>('pin')

  const canEditPin = !user || hasRole('admin') || (hasRole('manager') && user.role !== 'admin')

  useEffect(() => {
    const nextFormData: MemberFormData = user
      ? {
          name: user.name,
          email: user.email,
          role: user.role,
          password: '',
          pinEnabled: Boolean(user.pinEnabled),
          pin: '',
          pinConfirm: '',
        }
      : {
          name: '',
          email: '',
          role: 'user',
          password: '',
          pinEnabled: false,
          pin: '',
          pinConfirm: '',
        }

    setFormData(nextFormData)
    setInitialFormSnapshot(serializeMemberForm(nextFormData))
    setShowUnsavedConfirm(false)
    setPinField('pin')
  }, [user])

  const isDirty = useMemo(() => serializeMemberForm(formData) !== initialFormSnapshot, [formData, initialFormSnapshot])

  const requestBack = () => {
    if (isLoading) return
    if (isDirty) {
      setShowUnsavedConfirm(true)
      return
    }
    onBack()
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      let pinEnabled: boolean | undefined
      let pin: string | undefined

      if (canEditPin) {
        if (formData.pinEnabled) {
          const settingNewPin = formData.pin.length > 0 || formData.pinConfirm.length > 0 || !user?.pinEnabled
          if (settingNewPin) {
            if (formData.pin !== formData.pinConfirm) {
              toast.error(t('members.pinMismatch'))
              setIsLoading(false)
              return
            }
            const pinError = validatePin(formData.pin)
            if (pinError) {
              toast.error(t('members.pinRequired'))
              setIsLoading(false)
              return
            }
            pinEnabled = true
            pin = formData.pin
          } else {
            pinEnabled = true
          }
        } else if (user?.pinEnabled) {
          pinEnabled = false
        }
      }

      let result: { success: boolean; user?: User; error?: string }
      if (user) {
        const updates: {
          name: string
          email: string
          role: User['role']
          password?: string
          pinEnabled?: boolean
          pin?: string
        } = {
          name: formData.name,
          email: formData.email,
          role: formData.role,
        }

        // Only include password if admin is resetting it
        if (formData.password && hasRole('admin')) {
          updates.password = formData.password
        }
        if (pinEnabled !== undefined) {
          updates.pinEnabled = pinEnabled
        }
        if (pin) {
          updates.pin = pin
        }

        result = await authService.updateUser(user.id, updates)
      } else {
        result = await authService.createUser({
          name: formData.name,
          email: formData.email,
          role: formData.role,
          password: formData.password,
          pinEnabled,
          pin,
        })
      }

      if (result.success && result.user) {
        onSaved(result.user)
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
    <div class="mx-auto max-w-2xl">
      <div class="sticky top-0 z-10 -mx-1 mb-6 border-b border-fog-border bg-canvas px-1 py-3">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={requestBack}
              disabled={isLoading}
              class="shrink-0"
            >
              <ChevronLeftIcon class="mr-1 h-4 w-4" />
              {t('common.back')}
            </Button>
            <div class="min-w-0">
              <h1 class="truncate text-xl font-semibold text-void">
                {user ? t('members.editMember') : t('members.addMember')}
              </h1>
              <p class="text-sm text-graphite">{t('members.formPageHint')}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 sm:justify-end">
            <Button type="button" onClick={() => void handleSubmit(new Event('submit'))} disabled={isLoading}>
              {isLoading ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </div>
      </div>

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

          {canEditPin && (
            <div class="space-y-4 border-t border-fog-border pt-6">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.pinEnabled}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      pinEnabled: (e.target as HTMLInputElement).checked,
                      pin: '',
                      pinConfirm: '',
                    })
                  }
                  disabled={isLoading}
                  class="h-5 w-5 rounded border-fog-border bg-canvas text-void focus:ring-2 focus:ring-accent"
                />
                <span class="font-medium text-void">{t('members.enablePin')}</span>
              </label>
              <p class="text-sm text-graphite">{t('members.enablePinHint')}</p>

              {formData.pinEnabled && (
                <div class="space-y-4">
                  <Input
                    label={t('members.pin')}
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autocomplete="off"
                    value={formData.pin}
                    onFocus={() => setPinField('pin')}
                    onInput={(e) =>
                      setFormData({
                        ...formData,
                        pin: digitsOnly((e.target as HTMLInputElement).value),
                      })
                    }
                    required={!user?.pinEnabled}
                    placeholder={user?.pinEnabled ? t('members.leaveBlankKeepPin') : t('auth.enter6digitPin')}
                    helperText={user?.pinEnabled ? t('members.leaveBlankKeepPin') : undefined}
                  />
                  <Input
                    label={t('members.confirmPin')}
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autocomplete="off"
                    value={formData.pinConfirm}
                    onFocus={() => setPinField('pinConfirm')}
                    onInput={(e) =>
                      setFormData({
                        ...formData,
                        pinConfirm: digitsOnly((e.target as HTMLInputElement).value),
                      })
                    }
                    required={!user?.pinEnabled || formData.pin.length > 0}
                    placeholder={t('members.confirmPin')}
                  />
                  <VirtualKeypad
                    size="large"
                    disabled={isLoading}
                    onDigitPress={(digit) => {
                      setFormData((current) => ({
                        ...current,
                        [pinField]: digitsOnly(`${current[pinField]}${digit}`),
                      }))
                    }}
                    onBackspace={() => {
                      setFormData((current) => ({
                        ...current,
                        [pinField]: current[pinField].slice(0, -1),
                      }))
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      <DialogConfirm
        isOpen={showUnsavedConfirm}
        onClose={() => setShowUnsavedConfirm(false)}
        onConfirm={() => {
          setShowUnsavedConfirm(false)
          onBack()
        }}
        title={t('members.unsavedChangesTitle')}
        message={t('members.unsavedChangesMessage')}
        confirmText={t('members.discardChanges')}
        cancelText={t('common.cancel')}
        variant="danger"
      />
    </div>
  )
}

export default function Members() {
  const { t } = useTranslation()
  const panelClass = 'rounded-cards border border-fog-border bg-canvas '

  const [users, setUsers] = useState<User[]>([])
  const [deletedUsers, setDeletedUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [formUser, setFormUser] = useState<User | null>(null)
  const [view, setView] = useState<'list' | 'form'>('list')
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
    setFormUser(null)
    setView('form')
  }

  const handleEditUser = (user: User) => {
    setFormUser(user)
    setView('form')
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

  const handleCloseUserForm = () => {
    setView('list')
    setFormUser(null)
  }

  const handleSaveUser = async (_user: User) => {
    // Reload data to reflect changes with proper pagination
    await loadUsers(currentPage)
    handleCloseUserForm()
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

  if (isLoading && view === 'list') {
    return <PageLoader message={t('members.loadingMembers')} />
  }

  if (view === 'form') {
    return <MemberFormPage user={formUser} onBack={handleCloseUserForm} onSaved={handleSaveUser} />
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
            {(showDeletedUsers ? deletedUsers : users).map((user, index) => {
              const actionItems: DropdownItem[] = []
              const isProtectedAdmin = hasRole('manager') && !hasRole('admin') && user.role === 'admin'

              if (showDeletedUsers) {
                if (hasPermission('users.delete') || hasRole('admin')) {
                  actionItems.push({
                    id: `${user.id}-restore`,
                    label: t('members.restore'),
                    onClick: () => setRestoreConfirm(user.id),
                  })
                }
              } else {
                if ((hasPermission('users.edit') || hasRole('admin')) && !isProtectedAdmin) {
                  actionItems.push({
                    id: `${user.id}-edit`,
                    label: t('common.edit'),
                    onClick: () => handleEditUser(user),
                  })
                }

                if (
                  (hasPermission('users.delete') || hasRole('admin')) &&
                  user.id !== currentUser?.id &&
                  !isProtectedAdmin
                ) {
                  actionItems.push({
                    id: `${user.id}-archive`,
                    label: t('members.archive'),
                    onClick: () => setDeleteConfirm(user.id),
                    variant: 'danger',
                  })
                }
              }

              return (
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
                          {user.pinEnabled && !showDeletedUsers && (
                            <span class="rounded-full bg-chalk px-2 py-1 text-xs font-medium text-void ">
                              {t('members.pinBadge')}
                            </span>
                          )}
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
                    {actionItems.length > 0 && (
                      <div class="flex justify-center">
                        <Dropdown
                          align="right"
                          items={actionItems}
                          trigger={
                            <>
                              <span class="inline-flex h-7 w-7 items-center justify-center rounded-cards border border-fog-border text-graphite transition-colors hover:bg-chalk hover:text-void ">
                                <svg aria-hidden="true" viewBox="0 0 16 16" class="h-4 w-4 fill-current">
                                  <circle cx="3" cy="8" r="1.25" />
                                  <circle cx="8" cy="8" r="1.25" />
                                  <circle cx="13" cy="8" r="1.25" />
                                </svg>
                              </span>
                              <span class="sr-only">{t('common.actions')}</span>
                            </>
                          }
                        />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
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
