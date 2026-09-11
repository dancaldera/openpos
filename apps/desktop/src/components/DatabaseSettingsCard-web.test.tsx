// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getSettingsMock, saveSettingsMock, clearSettingsMock, toastErrorMock } = vi.hoisted(() => ({
  getSettingsMock: vi.fn(async () => ({
    configured: true,
    hostedProvisioning: false,
    databaseUrl: 'libsql://store.turso.io',
    org: null,
    group: null,
    updatedAt: null,
  })),
  saveSettingsMock: vi.fn(async () => ({})),
  clearSettingsMock: vi.fn(async () => {}),
  toastErrorMock: vi.fn(),
}))

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ isAdmin: true }),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: false,
}))

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}))

vi.mock('../services/database-settings', () => ({
  databaseSettingsService: {
    getSettings: getSettingsMock,
    saveSettings: saveSettingsMock,
    clearSettings: clearSettingsMock,
  },
}))

// The clear dialog cannot open on web (its button is hidden), so the stub
// below always renders the confirm action to reach the read-only guard.
vi.mock('./ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ui')>()
  return {
    ...actual,
    DialogConfirm: ({ onConfirm, onClose, title }: { onConfirm: () => void; onClose: () => void; title: string }) => (
      <div>
        <p>{title}</p>
        <button type="button" onClick={onConfirm}>
          stub-confirm
        </button>
        <button type="button" onClick={onClose}>
          stub-cancel
        </button>
      </div>
    ),
  }
})

const { DatabaseSettingsCard } = await import('./DatabaseSettingsCard')

afterEach(() => {
  cleanup()
  getSettingsMock.mockClear()
  saveSettingsMock.mockClear()
  clearSettingsMock.mockClear()
  toastErrorMock.mockClear()
})

describe('DatabaseSettingsCard on web', () => {
  it('explains that editing is disabled and ignores submits', async () => {
    render(<DatabaseSettingsCard />)
    await screen.findByText('settings.databaseStatusConfigured')

    expect(screen.getByText(/On web the store database is configured via Railway env/)).toBeDefined()
    const url = screen.getByLabelText('settings.databaseUrl') as HTMLInputElement
    expect(url.disabled).toBe(true)

    // No editing actions are offered on web.
    expect(screen.queryByRole('button', { name: 'settings.saveDatabaseSettings' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'settings.databaseClear' })).toBeNull()

    const form = url.closest('form')
    if (!form) throw new Error('expected url input inside a form')
    fireEvent.submit(form)
    expect(saveSettingsMock).not.toHaveBeenCalled()

    // Clearing is a no-op while read-only.
    fireEvent.click(screen.getByRole('button', { name: 'stub-confirm' }))
    expect(clearSettingsMock).not.toHaveBeenCalled()
  })
})
