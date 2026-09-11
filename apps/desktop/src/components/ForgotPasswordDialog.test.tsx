// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { resetPasswordMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  resetPasswordMock: vi.fn(async () => ({ success: true as boolean, error: undefined as string | undefined })),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}))

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock },
}))

vi.mock('../services/auth-turso', () => ({
  authService: { resetPasswordWithInternalSecret: resetPasswordMock },
}))

const { ForgotPasswordDialog } = await import('./ForgotPasswordDialog')

function byLabel(key: string) {
  // Required fields render the label with a trailing asterisk.
  return screen.getByLabelText(key, { exact: false })
}

function fill(email: string, secret: string, next: string, confirm: string) {
  fireEvent.input(byLabel('auth.email'), { target: { value: email } })
  fireEvent.input(byLabel('auth.recovery.internalSecret'), { target: { value: secret } })
  fireEvent.input(byLabel('auth.recovery.newPassword'), { target: { value: next } })
  fireEvent.input(byLabel('auth.recovery.confirmPassword'), { target: { value: confirm } })
}

function submit() {
  const form = screen.getByRole('button', { name: 'auth.recovery.submit' }).closest('form')
  if (!form) throw new Error('expected submit button inside a form')
  fireEvent.submit(form)
}

afterEach(() => {
  cleanup()
  resetPasswordMock.mockReset()
  toastErrorMock.mockClear()
  toastSuccessMock.mockClear()
  resetPasswordMock.mockResolvedValue({ success: true, error: undefined })
})

describe('ForgotPasswordDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ForgotPasswordDialog isOpen={false} onClose={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('validates required fields and matching passwords', async () => {
    render(<ForgotPasswordDialog isOpen onClose={() => {}} initialEmail="op@example.com" />)

    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('auth.fillAllFields'))

    fill('op@example.com', 'secret', 'New!pass1', 'Other!pass2')
    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('auth.recovery.passwordsDoNotMatch'))
    expect(resetPasswordMock).not.toHaveBeenCalled()
  })

  it('resets the password and closes on success', async () => {
    const onClose = vi.fn()
    render(<ForgotPasswordDialog isOpen onClose={onClose} />)

    fill('  op@example.com  ', 'secret', 'New!pass1', 'New!pass1')
    submit()

    await vi.waitFor(() => expect(resetPasswordMock).toHaveBeenCalledWith('op@example.com', 'secret', 'New!pass1'))
    expect(toastSuccessMock).toHaveBeenCalledWith('auth.recovery.resetSuccess')
    expect(onClose).toHaveBeenCalled()
  })

  it('reports reset failures', async () => {
    render(<ForgotPasswordDialog isOpen onClose={() => {}} />)

    resetPasswordMock.mockResolvedValueOnce({ success: false, error: 'denied' })
    fill('op@example.com', 'secret', 'New!pass1', 'New!pass1')
    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('denied'))

    resetPasswordMock.mockResolvedValueOnce({ success: false, error: undefined })
    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('auth.recovery.resetFailed'))

    resetPasswordMock.mockRejectedValueOnce(new Error('down'))
    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('down'))

    resetPasswordMock.mockRejectedValueOnce('string-failure')
    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('auth.recovery.resetFailed'))
  })

  it('shows the loading state while resetting', async () => {
    let resolveReset!: (value: { success: boolean; error: string | undefined }) => void
    resetPasswordMock.mockImplementationOnce(
      () => new Promise<{ success: boolean; error: string | undefined }>((resolve) => (resolveReset = resolve)),
    )
    render(<ForgotPasswordDialog isOpen onClose={() => {}} />)
    fill('op@example.com', 'secret', 'New!pass1', 'New!pass1')

    submit()
    await screen.findByText('common.loading')
    resolveReset({ success: true, error: undefined })
    await vi.waitFor(() => expect(toastSuccessMock).toHaveBeenCalled())
  })

  it('cancels and resets the form when reopened', () => {
    const onClose = vi.fn()
    const { rerender } = render(<ForgotPasswordDialog isOpen onClose={onClose} initialEmail="a@example.com" />)

    fill('changed@example.com', 'secret', 'New!pass1', 'New!pass1')
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(onClose).toHaveBeenCalled()

    rerender(<ForgotPasswordDialog isOpen={false} onClose={onClose} initialEmail="a@example.com" />)
    rerender(<ForgotPasswordDialog isOpen onClose={onClose} initialEmail="b@example.com" />)
    expect((byLabel('auth.email') as HTMLInputElement).value).toBe('b@example.com')
    expect((byLabel('auth.recovery.newPassword') as HTMLInputElement).value).toBe('')
  })
})
