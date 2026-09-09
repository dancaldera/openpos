import { describe, expect, it, vi } from 'vitest'

const { registerSingleInstance } = await import('./app-lifecycle.cjs')

function mockApp(lock = true) {
  return { requestSingleInstanceLock: vi.fn(() => lock), quit: vi.fn(), on: vi.fn() }
}

function mockWindow(overrides = {}) {
  return {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    restore: vi.fn(),
    focus: vi.fn(),
    ...overrides,
  }
}

describe('registerSingleInstance', () => {
  it('quits when the lock is taken', () => {
    const app = mockApp(false)

    expect(registerSingleInstance(app, () => null)).toBe(false)
    expect(app.quit).toHaveBeenCalledTimes(1)
    expect(app.on).not.toHaveBeenCalled()
  })

  it('focuses the window on second instance', () => {
    const app = mockApp()
    const window = mockWindow()

    expect(registerSingleInstance(app, () => window)).toBe(true)
    const handler = app.on.mock.calls[0][1]
    handler()

    expect(window.restore).not.toHaveBeenCalled()
    expect(window.focus).toHaveBeenCalledTimes(1)
  })

  it('restores a minimized window', () => {
    const app = mockApp()
    const window = mockWindow({ isMinimized: () => true })

    registerSingleInstance(app, () => window)
    app.on.mock.calls[0][1]()

    expect(window.restore).toHaveBeenCalledTimes(1)
    expect(window.focus).toHaveBeenCalledTimes(1)
  })

  it('ignores missing, destroyed, or hidden windows', () => {
    const app = mockApp()

    registerSingleInstance(app, () => null)
    app.on.mock.calls[0][1]()

    const destroyed = mockWindow({ isDestroyed: () => true })
    registerSingleInstance(app, () => destroyed)
    app.on.mock.calls[1][1]()
    expect(destroyed.focus).not.toHaveBeenCalled()

    const hidden = mockWindow({ isVisible: () => false })
    registerSingleInstance(app, () => hidden)
    app.on.mock.calls[2][1]()
    expect(hidden.focus).not.toHaveBeenCalled()
  })
})
