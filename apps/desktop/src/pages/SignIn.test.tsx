// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  platform: { isDesktop: false },
  signIn: vi.fn(),
  signInWithPin: vi.fn(),
  getAllUsersForLogin: vi.fn(),
  resetPasswordWithInternalSecret: vi.fn(),
  resetSettings: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }),
}))
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ signIn: mocks.signIn, signInWithPin: mocks.signInWithPin }),
}))
vi.mock('../lib/platform', () => ({
  get isDesktop() {
    return mocks.platform.isDesktop
  },
}))
vi.mock('../lib/desktop', () => ({
  getDesktopApi: () => null,
  requireDesktopApi: () => ({ resetSettings: mocks.resetSettings }),
}))
vi.mock('../lib/toast', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, warning: mocks.toastWarning, info: vi.fn() },
}))
vi.mock('../services/auth-turso', () => ({
  authService: {
    getAllUsersForLogin: mocks.getAllUsersForLogin,
    resetPasswordWithInternalSecret: mocks.resetPasswordWithInternalSecret,
  },
}))

// happy-dom rejects `finished` when Astryx cancels a segmented-control animation on unmount.
const animate = Element.prototype.animate
Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
  const animation = animate.apply(this, args)
  animation.finished.catch(() => undefined)
  return animation
}

const { default: SignIn } = await import('./SignIn')

const ana = { id: 'u1', name: 'Ana Lopez', email: 'ana@shop.test', role: 'manager', pinEnabled: true }
const bob = { id: 'u2', name: 'Bob Diaz', email: 'bob@shop.test', role: 'user', pinEnabled: true }
const carl = { id: 'u3', name: 'Carl', email: 'carl@shop.test', role: 'admin', pinEnabled: false }

function input(placeholderOrType: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(
    placeholderOrType.startsWith('type=') ? `input[${placeholderOrType}]` : `input[placeholder="${placeholderOrType}"]`,
  )
  if (!el) throw new Error(`input ${placeholderOrType} not found`)
  return el
}

function passwordInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'))
}

function type(el: HTMLInputElement, value: string) {
  fireEvent.change(el, { target: { value } })
}

function expectNoEmoji() {
  expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
}

beforeEach(() => {
  mocks.platform.isDesktop = false
  mocks.getAllUsersForLogin.mockResolvedValue([carl])
  mocks.signIn.mockResolvedValue({ success: true })
  mocks.signInWithPin.mockResolvedValue({ success: true })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SignIn with email', () => {
  it('signs in with email and password', async () => {
    mocks.signIn.mockResolvedValueOnce({ success: true, warning: 'Offline mode' })
    render(<SignIn />)

    await screen.findByPlaceholderText('email@example.com')
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.getByRole('heading', { name: 'auth.signIn' })).toBeTruthy()
    expectNoEmoji()

    const submit = screen.getByRole('button', { name: 'auth.signIn' })
    expect(submit.getAttribute('aria-disabled') === 'true' || (submit as HTMLButtonElement).disabled).toBe(true)

    type(input('email@example.com'), 'ana@shop.test')
    type(passwordInputs()[0], 'Secret123!')
    fireEvent.submit(input('email@example.com').closest('form') as HTMLFormElement)

    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith('ana@shop.test', 'Secret123!'))
    await waitFor(() => expect(mocks.toastWarning).toHaveBeenCalledWith('Offline mode'))
  })

  it('shows sign-in failures inline', async () => {
    mocks.signIn.mockResolvedValueOnce({ success: false, error: 'Incorrect password' })
    render(<SignIn />)

    type(await screen.findByPlaceholderText('email@example.com'), 'ana@shop.test')
    type(passwordInputs()[0], 'nope')
    fireEvent.submit(input('email@example.com').closest('form') as HTMLFormElement)

    expect(await screen.findByText('Incorrect password')).toBeTruthy()
    type(passwordInputs()[0], 'nope2')
    expect(screen.queryByText('Incorrect password')).toBeNull()
  })

  it('toggles password visibility', async () => {
    render(<SignIn />)
    await screen.findByPlaceholderText('email@example.com')
    expect(passwordInputs()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'auth.showPassword' }))
    expect(passwordInputs()).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'auth.hidePassword' })).toBeTruthy()
  })
})

describe('SignIn with PIN', () => {
  beforeEach(() => {
    mocks.getAllUsersForLogin.mockResolvedValue([ana, bob, carl])
  })

  it('lists PIN members, filters them, and signs in after six digits', async () => {
    render(<SignIn />)

    expect(await screen.findByText('Ana Lopez')).toBeTruthy()
    expect(screen.getByText('Bob Diaz')).toBeTruthy()
    expect(screen.queryByText('Carl')).toBeNull()
    expect(screen.getByText('auth.selectMember')).toBeTruthy()
    expectNoEmoji()

    type(input('auth.searchMembers'), 'bob')
    expect(screen.queryByText('Ana Lopez')).toBeNull()
    type(input('auth.searchMembers'), 'zzz')
    expect(screen.getByText('auth.noMembersFound')).toBeTruthy()
    type(input('auth.searchMembers'), '')

    fireEvent.click(screen.getByText('Ana Lopez'))
    expect(screen.getByText('auth.signingInAs {"name":"Ana Lopez"}')).toBeTruthy()

    for (const digit of ['1', '2', '3', '4', '5']) {
      fireEvent.click(screen.getByRole('button', { name: digit }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'auth.backspace' }))
    expect(input('type="password"').value).toBe('1234')
    fireEvent.keyDown(window, { key: '9' })
    fireEvent.keyDown(window, { key: '0' })

    await waitFor(() => expect(mocks.signInWithPin).toHaveBeenCalledWith('u1', '123490'))
  })

  it('shows an invalid PIN inline and clears the entry', async () => {
    mocks.signInWithPin.mockResolvedValueOnce({ success: false })
    render(<SignIn />)

    fireEvent.click(await screen.findByText('Bob Diaz'))
    for (const digit of ['1', '1', '1', '1', '1', '1']) {
      fireEvent.click(screen.getByRole('button', { name: digit }))
    }

    expect(await screen.findByText('auth.invalidPin')).toBeTruthy()
    expect(input('type="password"').value).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'auth.switchMember' }))
    expect(screen.getByText('Ana Lopez')).toBeTruthy()
  })

  it('switches to email sign-in', async () => {
    render(<SignIn />)
    await screen.findByText('Ana Lopez')

    fireEvent.click(screen.getByRole('radio', { name: 'auth.modeEmail' }))

    expect(screen.getByPlaceholderText('email@example.com')).toBeTruthy()
    expect(screen.queryByText('Ana Lopez')).toBeNull()
  })
})

describe('SignIn recovery steps', () => {
  it('resets the password as an in-page step, not a dialog', async () => {
    mocks.resetPasswordWithInternalSecret.mockResolvedValueOnce({ success: true })
    render(<SignIn />)

    type(await screen.findByPlaceholderText('email@example.com'), 'ana@shop.test')
    fireEvent.click(screen.getByRole('button', { name: 'auth.forgotPassword' }))

    expect(screen.getByRole('heading', { name: 'auth.recovery.title' })).toBeTruthy()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(input('email@example.com').value).toBe('ana@shop.test')
    expectNoEmoji()

    const [secret, next, confirm] = passwordInputs()
    type(secret, 'internal')
    type(next, 'NewPass1!')
    type(confirm, 'Mismatch1!')
    fireEvent.submit(input('email@example.com').closest('form') as HTMLFormElement)
    expect(await screen.findByText('auth.recovery.passwordsDoNotMatch')).toBeTruthy()
    expect(mocks.resetPasswordWithInternalSecret).not.toHaveBeenCalled()

    type(confirm, 'NewPass1!')
    fireEvent.submit(input('email@example.com').closest('form') as HTMLFormElement)

    await waitFor(() =>
      expect(mocks.resetPasswordWithInternalSecret).toHaveBeenCalledWith('ana@shop.test', 'internal', 'NewPass1!'),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('auth.recovery.resetSuccess')
    expect(await screen.findByRole('heading', { name: 'auth.signIn' })).toBeTruthy()
  })

  it('shows reset failures and goes back to sign-in', async () => {
    mocks.resetPasswordWithInternalSecret.mockResolvedValueOnce({ success: false, error: 'Bad key' })
    render(<SignIn />)

    fireEvent.click(await screen.findByRole('button', { name: 'auth.forgotPassword' }))
    type(input('email@example.com'), 'ana@shop.test')
    for (const el of passwordInputs()) type(el, 'NewPass1!')
    fireEvent.submit(input('email@example.com').closest('form') as HTMLFormElement)

    expect(await screen.findByText('Bad key')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'auth.backToSignIn' }))
    expect(screen.getByRole('heading', { name: 'auth.signIn' })).toBeTruthy()
  })

  it('offers reset settings only on desktop and calls the desktop API', async () => {
    render(<SignIn />)
    await screen.findByPlaceholderText('email@example.com')
    expect(screen.queryByRole('button', { name: 'auth.resetSettings' })).toBeNull()
    cleanup()

    mocks.platform.isDesktop = true
    mocks.resetSettings.mockResolvedValueOnce({ status: 'needsConnection' })
    render(<SignIn />)
    await screen.findByPlaceholderText('email@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'auth.resetSettings' }))
    expect(screen.getByRole('heading', { name: 'auth.resetSettings' })).toBeTruthy()

    const form = passwordInputs()[0].closest('form') as HTMLFormElement
    fireEvent.submit(form)
    expect(await screen.findByText('auth.resetSettingsKeyRequired')).toBeTruthy()

    type(passwordInputs()[0], 'operator-key')
    fireEvent.submit(form)
    await waitFor(() => expect(mocks.resetSettings).toHaveBeenCalledWith('operator-key'))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('auth.resetSettingsSuccess')
  })
})
