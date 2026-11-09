// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../services/auth-turso'

type Role = User['role']

const MANAGER_PERMISSIONS = ['users.view', 'users.create', 'users.edit', 'users.delete']

const mocks = vi.hoisted(() => ({
  getUsers: vi.fn(),
  getUsersPaginated: vi.fn(),
  getDeletedUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  restoreUser: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  current: { id: 'u1', role: 'admin' as 'admin' | 'manager' | 'user', permissions: ['*'] as string[] },
}))

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }),
}))
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: mocks.current.id, name: 'Current', role: mocks.current.role },
    hasRole: (role: string) => mocks.current.role === role,
    hasPermission: (permission: string) =>
      mocks.current.permissions.includes('*') || mocks.current.permissions.includes(permission),
  }),
}))
vi.mock('../../lib/router', () => ({ hrefFor: (path: string) => `#/${path}`, navigate: mocks.navigate }))
vi.mock('../../lib/toast', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, info: vi.fn(), warning: vi.fn() },
}))
vi.mock('../../services/auth-turso', () => ({
  authService: {
    getUsers: mocks.getUsers,
    getUsersPaginated: mocks.getUsersPaginated,
    getDeletedUsers: mocks.getDeletedUsers,
    createUser: mocks.createUser,
    updateUser: mocks.updateUser,
    deleteUser: mocks.deleteUser,
    restoreUser: mocks.restoreUser,
  },
}))

// happy-dom rejects `finished` when Astryx cancels a segmented-control animation on unmount.
const animate = Element.prototype.animate
Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
  const animation = animate.apply(this, args)
  animation.finished.catch(() => undefined)
  return animation
}

const { default: MembersSection } = await import('./MembersSection')

function makeUser(id: string, name: string, role: Role, extra: Partial<User> = {}): User {
  return {
    id,
    name,
    email: `${name.toLowerCase()}@example.com`,
    role,
    permissions: [],
    createdAt: '2026-01-02T10:00:00.000Z',
    ...extra,
  }
}

const self = makeUser('u1', 'Current', 'admin')
const admin = makeUser('2', 'Olivia', 'admin', { pinEnabled: true })
const cashier = makeUser('3', 'Pedro', 'user', { lastLogin: '2026-11-01T09:00:00.000Z' })
const archived = makeUser('4', 'Rosa', 'user', { deletedAt: '2026-10-01T09:00:00.000Z' })

const STRONG_PASSWORD = 'Str0ng!pass'
const noEmoji = () => expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)

function signInAs(role: Role) {
  mocks.current = {
    id: 'u1',
    role,
    permissions: role === 'admin' ? ['*'] : role === 'manager' ? MANAGER_PERMISSIONS : ['sales.view'],
  }
}

beforeEach(() => {
  signInAs('admin')
  mocks.getUsers.mockResolvedValue([self, admin, cashier, archived])
  mocks.getUsersPaginated.mockResolvedValue({
    users: [self, admin, cashier],
    totalCount: 3,
    totalPages: 1,
    currentPage: 1,
  })
  mocks.getDeletedUsers.mockResolvedValue([archived])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MembersSection', () => {
  it('lists members with links to their pages and no emoji', async () => {
    render(<MembersSection params={[]} />)
    const link = await screen.findByRole('link', { name: 'Pedro' })
    expect(link.getAttribute('href')).toBe('#/members/3')
    expect(screen.getByRole('link', { name: 'members.newMember' }).getAttribute('href')).toBe('#/members/new')
    expect(mocks.getUsersPaginated).toHaveBeenCalledWith(1, 10)
    noEmoji()
  })

  it('switches to archived members', async () => {
    render(<MembersSection params={[]} />)
    await screen.findByRole('link', { name: 'Pedro' })
    fireEvent.click(await screen.findByRole('radio', { name: /members\.archivedTab/ }))
    expect(await screen.findByRole('link', { name: 'Rosa' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Pedro' })).toBeNull()
  })

  it('denies access to members without users.view', () => {
    signInAs('user')
    render(<MembersSection params={[]} />)
    expect(screen.getByText('members.accessDenied')).toBeTruthy()
    expect(mocks.getUsersPaginated).not.toHaveBeenCalled()
  })

  it('archives a member after an in-page confirmation', async () => {
    mocks.deleteUser.mockResolvedValue({ success: true })
    render(<MembersSection params={['3']} />)
    fireEvent.click(await screen.findByRole('button', { name: 'members.archiveMember' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'members.archive' }))
    await waitFor(() => expect(mocks.deleteUser).toHaveBeenCalledWith('3'))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('members.userArchived')
    expect(mocks.navigate).toHaveBeenCalledWith('members')
    noEmoji()
  })

  it('never offers to archive your own account', async () => {
    render(<MembersSection params={['u1']} />)
    await screen.findByRole('heading', { level: 1, name: 'Current' })
    expect(screen.getByRole('link', { name: 'common.edit' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'members.archiveMember' })).toBeNull()
  })

  it('keeps managers from editing or archiving admins', async () => {
    signInAs('manager')
    render(<MembersSection params={['2']} />)
    await screen.findByRole('heading', { level: 1, name: 'Olivia' })
    expect(screen.queryByRole('link', { name: 'common.edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'members.archiveMember' })).toBeNull()
  })

  it('blocks the edit page for an admin when signed in as a manager', async () => {
    signInAs('manager')
    render(<MembersSection params={['2', 'edit']} />)
    expect(await screen.findByText('members.cannotEditTitle')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'members.saveChanges' })).toBeNull()
  })

  it('restores an archived member', async () => {
    mocks.restoreUser.mockResolvedValue({ success: true, user: { ...archived, deletedAt: undefined } })
    render(<MembersSection params={['4']} />)
    fireEvent.click(await screen.findByRole('button', { name: 'members.restore' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'members.restore' }).at(-1) as HTMLElement)
    await waitFor(() => expect(mocks.restoreUser).toHaveBeenCalledWith('4'))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('members.userRestored')
  })

  it('creates a member with a strong password and opens it', async () => {
    mocks.createUser.mockResolvedValue({ success: true, user: { ...cashier, id: '42' } })
    render(<MembersSection params={['new']} />)
    fireEvent.change(screen.getByRole('textbox', { name: /members\.fullName/ }), { target: { value: 'Lena' } })
    fireEvent.change(screen.getByRole('textbox', { name: /members\.emailAddress/ }), {
      target: { value: 'lena@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/auth\.password/), { target: { value: STRONG_PASSWORD } })
    fireEvent.click(screen.getAllByRole('button', { name: 'members.createMember' })[0] as HTMLElement)
    await waitFor(() =>
      expect(mocks.createUser).toHaveBeenCalledWith({
        name: 'Lena',
        email: 'lena@example.com',
        role: 'user',
        password: STRONG_PASSWORD,
        pinEnabled: undefined,
        pin: undefined,
      }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('members.userCreated')
    expect(mocks.navigate).toHaveBeenCalledWith('members/42')
    noEmoji()
  })

  it('rejects a weak password before calling the service', async () => {
    render(<MembersSection params={['new']} />)
    fireEvent.change(screen.getByRole('textbox', { name: /members\.fullName/ }), { target: { value: 'Lena' } })
    fireEvent.change(screen.getByRole('textbox', { name: /members\.emailAddress/ }), {
      target: { value: 'lena@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/auth\.password/), { target: { value: 'weak' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'members.createMember' })[0] as HTMLElement)
    expect((await screen.findAllByText('members.passwordRequirementsHint')).length).toBeGreaterThan(0)
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('sets a PIN with the keypad and rejects mismatched PINs', async () => {
    mocks.createUser.mockResolvedValue({ success: true, user: { ...cashier, id: '43' } })
    render(<MembersSection params={['new']} />)
    fireEvent.change(screen.getByRole('textbox', { name: /members\.fullName/ }), { target: { value: 'Lena' } })
    fireEvent.change(screen.getByRole('textbox', { name: /members\.emailAddress/ }), {
      target: { value: 'lena@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/auth\.password/), { target: { value: STRONG_PASSWORD } })
    fireEvent.click(screen.getByRole('switch', { name: 'members.enablePin' }))
    for (const digit of '123456') fireEvent.click(screen.getByRole('button', { name: digit }))
    for (const digit of '123450') fireEvent.click(screen.getByRole('button', { name: digit }))
    fireEvent.click(screen.getAllByRole('button', { name: 'members.createMember' })[0] as HTMLElement)
    expect((await screen.findAllByText('members.pinMismatch')).length).toBeGreaterThan(0)
    expect(mocks.createUser).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'members.deleteDigit' }))
    fireEvent.click(screen.getByRole('button', { name: '6' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'members.createMember' })[0] as HTMLElement)
    await waitFor(() =>
      expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({ pinEnabled: true, pin: '123456' })),
    )
  })

  it('lets managers edit a cashier without resetting the password', async () => {
    signInAs('manager')
    mocks.updateUser.mockResolvedValue({ success: true, user: cashier })
    render(<MembersSection params={['3', 'edit']} />)
    const name = await screen.findByRole('textbox', { name: /members\.fullName/ })
    expect(screen.queryByLabelText(/members\.newPassword/)).toBeNull()
    fireEvent.change(name, { target: { value: 'Pedro Gil' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'members.saveChanges' })[0] as HTMLElement)
    await waitFor(() =>
      expect(mocks.updateUser).toHaveBeenCalledWith('3', {
        name: 'Pedro Gil',
        email: 'pedro@example.com',
        role: 'user',
      }),
    )
    expect(mocks.navigate).toHaveBeenCalledWith('members/3')
  })

  it('lets admins reset a password while editing', async () => {
    mocks.updateUser.mockResolvedValue({ success: true, user: cashier })
    render(<MembersSection params={['3', 'edit']} />)
    fireEvent.change(await screen.findByLabelText(/members\.newPassword/), { target: { value: STRONG_PASSWORD } })
    fireEvent.click(screen.getAllByRole('button', { name: 'members.saveChanges' })[0] as HTMLElement)
    await waitFor(() =>
      expect(mocks.updateUser).toHaveBeenCalledWith('3', expect.objectContaining({ password: STRONG_PASSWORD })),
    )
  })
})
