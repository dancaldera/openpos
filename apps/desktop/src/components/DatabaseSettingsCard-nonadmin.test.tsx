// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getSettingsMock } = vi.hoisted(() => ({
  getSettingsMock: vi.fn(async () => ({
    configured: false,
    hostedProvisioning: false,
    databaseUrl: null,
    org: null,
    group: null,
    updatedAt: null,
  })),
}))

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ isAdmin: false }),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: true,
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('../services/database-settings', () => ({
  databaseSettingsService: {
    getSettings: getSettingsMock,
    saveSettings: vi.fn(async () => ({})),
    clearSettings: vi.fn(async () => {}),
  },
}))

const { DatabaseSettingsCard } = await import('./DatabaseSettingsCard')

afterEach(() => {
  cleanup()
  getSettingsMock.mockClear()
})

describe('DatabaseSettingsCard for non-admins', () => {
  it('renders nothing and never loads settings', () => {
    const { container } = render(<DatabaseSettingsCard />)
    expect(container.innerHTML).toBe('')
    expect(getSettingsMock).not.toHaveBeenCalled()
  })
})
