// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { signOutMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
}))

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ signOut: signOutMock }),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: false,
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
})

describe('DangerZoneCard on web', () => {
  it('resets without the desktop bridge', async () => {
    const reload = stubReload()
    render(<DangerZoneCard />)

    fireEvent.click(screen.getByRole('button', { name: 'settings.dangerZoneReset' }))
    const confirmButtons = screen.getAllByRole('button', { name: 'settings.dangerZoneReset' })
    fireEvent.click(confirmButtons[confirmButtons.length - 1])

    await vi.waitFor(() => expect(signOutMock).toHaveBeenCalled())
    expect(reload).toHaveBeenCalled()
  })
})
