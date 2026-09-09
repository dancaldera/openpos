// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'

const { onStatusChange } = vi.hoisted(() => ({
  onStatusChange: vi.fn(() => () => {}),
}))

vi.mock('../../lib/desktop', () => ({
  getDesktopApi: () => ({
    updates: { onStatusChange },
  }),
}))

const { updateActions } = await import('./updateActions')

it('subscribes to desktop status updates on load', () => {
  expect(onStatusChange).toHaveBeenCalledTimes(1)
  expect(typeof updateActions.checkForUpdate).toBe('function')
})
