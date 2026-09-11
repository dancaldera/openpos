// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { changePasswordMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  changePasswordMock: vi.fn(async () => ({ success: true as boolean, error: undefined as string | undefined })),
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
  authService: { changePassword: changePasswordMock },
}))

const { ChangePasswordCard } = await import('./ChangePasswordCard')

function fillPasswords(current: string, next: string, confirm: string) {
  const inputs = screen.getAllByLabelText(/settings\.currentPassword|auth\.recovery\.(new|confirm)Password/)
  fireEvent.input(inputs[0], { target: { value: current } })
  fireEvent.input(inputs[1], { target: { value: next } })
  fireEvent.input(inputs[2], { target: { value: confirm } })
}

function submit() {
  const form = screen.getByRole('button', { name: /settings\.changePassword|common\.loading/ }).closest('form')
  if (!form) throw new Error('expected submit button inside a form')
  fireEvent.submit(form)
}

afterEach(() => {
  cleanup()
  changePasswordMock.mockReset()
  toastErrorMock.mockClear()
  toastSuccessMock.mockClear()
  changePasswordMock.mockResolvedValue({ success: true, error: undefined })
})

describe('ChangePasswordCard', () => {
  it('requires all fields to match', async () => {
    render(<ChangePasswordCard />)

    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('auth.fillAllFields'))

    fillPasswords('old', 'new-one', 'new-two')
    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('auth.recovery.passwordsDoNotMatch'))
    expect(changePasswordMock).not.toHaveBeenCalled()
  })

  it('changes the password and clears the form', async () => {
    render(<ChangePasswordCard />)
    fillPasswords('old', 'Str0ng!pass', 'Str0ng!pass')

    submit()

    await vi.waitFor(() => expect(changePasswordMock).toHaveBeenCalledWith('old', 'Str0ng!pass'))
    expect(toastSuccessMock).toHaveBeenCalledWith('settings.changePasswordSuccess')
    await vi.waitFor(() => {
      const inputs = screen
        .getAllByLabelText(/Password|password/)
        .filter((el): el is HTMLInputElement => el instanceof HTMLInputElement)
      expect(inputs).toHaveLength(3)
      for (const input of inputs) {
        expect(input.value).toBe('')
      }
    })
  })

  it('shows the loading state while changing', async () => {
    let resolveChange!: (value: { success: boolean; error: string | undefined }) => void
    changePasswordMock.mockImplementationOnce(
      () => new Promise<{ success: boolean; error: string | undefined }>((resolve) => (resolveChange = resolve)),
    )
    render(<ChangePasswordCard />)
    fillPasswords('old', 'Str0ng!pass', 'Str0ng!pass')

    submit()
    await screen.findByText('common.loading')
    resolveChange({ success: true, error: undefined })
    await vi.waitFor(() => expect(toastSuccessMock).toHaveBeenCalled())
  })

  it('reports change failures', async () => {
    render(<ChangePasswordCard />)
    fillPasswords('old', 'Str0ng!pass', 'Str0ng!pass')

    changePasswordMock.mockResolvedValueOnce({ success: false, error: 'weak' })
    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('weak'))

    changePasswordMock.mockResolvedValueOnce({ success: false, error: undefined })
    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('settings.changePasswordFailed'))

    changePasswordMock.mockRejectedValueOnce(new Error('down'))
    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('down'))

    changePasswordMock.mockRejectedValueOnce('string-failure')
    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('settings.changePasswordFailed'))
  })
})
