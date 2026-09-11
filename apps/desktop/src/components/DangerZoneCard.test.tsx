// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { signOutMock, toastErrorMock, factoryResetMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  toastErrorMock: vi.fn(),
  factoryResetMock: vi.fn(async () => {}),
}))

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ signOut: signOutMock }),
}))

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}))

vi.mock('../lib/desktop', () => ({
  requireDesktopApi: () => ({ connection: { factoryReset: factoryResetMock } }),
  getDesktopApi: () => undefined,
}))

vi.mock('../lib/platform', () => ({
  isDesktop: true,
}))

const { DangerZoneCard } = await import('./DangerZoneCard')

function stubReload() {
  const reload = vi.fn()
  Object.defineProperty(window, 'location', { value: { reload }, writable: true, configurable: true })
  return reload
}

afterEach(() => {
  cleanup()
  signOutMock.mockClear()
  toastErrorMock.mockClear()
  factoryResetMock.mockClear()
})

describe('DangerZoneCard', () => {
  it('opens the confirmation dialog', () => {
    render(<DangerZoneCard />)

    fireEvent.click(screen.getByRole('button', { name: 'settings.dangerZoneReset' }))
    expect(screen.getByText('settings.dangerZoneConfirm')).toBeDefined()
  })

  it('resets the device through the desktop bridge', async () => {
    const reload = stubReload()
    render(<DangerZoneCard />)

    fireEvent.click(screen.getByRole('button', { name: 'settings.dangerZoneReset' }))
    const confirmButtons = screen.getAllByRole('button', { name: 'settings.dangerZoneReset' })
    fireEvent.click(confirmButtons[confirmButtons.length - 1])

    await vi.waitFor(() => expect(factoryResetMock).toHaveBeenCalled())
    expect(signOutMock).toHaveBeenCalled()
    expect(reload).toHaveBeenCalled()
  })

  it('shows the resetting state while the bridge works', async () => {
    stubReload()
    let resolveReset!: () => void
    factoryResetMock.mockImplementationOnce(() => new Promise<void>((resolve) => (resolveReset = resolve)))
    render(<DangerZoneCard />)

    fireEvent.click(screen.getByRole('button', { name: 'settings.dangerZoneReset' }))
    const confirmButtons = screen.getAllByRole('button', { name: 'settings.dangerZoneReset' })
    fireEvent.click(confirmButtons[confirmButtons.length - 1])

    const resetting = await screen.findAllByText('settings.dangerZoneResetting')
    expect(resetting).toHaveLength(2)
    resolveReset()
    await vi.waitFor(() => expect(signOutMock).toHaveBeenCalled())
  })

  it('closes the dialog via the X button and the backdrop', () => {
    render(<DangerZoneCard />)

    fireEvent.click(screen.getByRole('button', { name: 'settings.dangerZoneReset' }))
    expect(screen.getByText('settings.dangerZoneConfirm')).toBeDefined()

    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog.querySelector('button') as HTMLButtonElement)
    expect(screen.queryByText('settings.dangerZoneConfirm')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'settings.dangerZoneReset' }))
    fireEvent.click(screen.getByLabelText('Close dialog'))
    expect(screen.queryByText('settings.dangerZoneConfirm')).toBeNull()
  })

  it('reports reset failures', async () => {
    render(<DangerZoneCard />)
    const openDialog = () => fireEvent.click(screen.getByRole('button', { name: 'settings.dangerZoneReset' }))
    const confirm = () => {
      const buttons = screen.getAllByRole('button', { name: 'settings.dangerZoneReset' })
      fireEvent.click(buttons[buttons.length - 1])
    }

    factoryResetMock.mockRejectedValueOnce(new Error('nope'))
    openDialog()
    confirm()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('nope'))
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    await vi.waitFor(() => expect(screen.getAllByRole('button', { name: 'settings.dangerZoneReset' })).toHaveLength(1))

    factoryResetMock.mockRejectedValueOnce('string-failure')
    openDialog()
    confirm()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('settings.dangerZoneFailed'))
  })
})
