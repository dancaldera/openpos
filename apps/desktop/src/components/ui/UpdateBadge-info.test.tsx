// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../lib/platform', () => ({
  isDesktop: true,
}))

vi.mock('../../lib/desktop', () => ({
  getDesktopApi: () => ({
    getInfo: async () => {
      throw new Error('unavailable')
    },
    updates: { openReleasePage: vi.fn(async () => {}) },
  }),
}))

vi.mock('../../stores/update/updateActions', () => ({
  updateActions: {
    checkForUpdate: vi.fn(async () => false),
    downloadUpdate: vi.fn(async () => false),
    installAndRestart: vi.fn(async () => false),
  },
}))

const { UpdateBadge } = await import('./UpdateBadge')

afterEach(cleanup)

describe('UpdateBadge without app info', () => {
  it('falls back to an unknown installed version', () => {
    render(<UpdateBadge />)
    expect(screen.getByText('update.updates')).toBeDefined()
  })
})
