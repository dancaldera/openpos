// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./App', () => ({
  default: () => <div data-testid="app-root">app</div>,
}))

const realRaf = globalThis.requestAnimationFrame

afterEach(() => {
  document.body.innerHTML = ''
  globalThis.requestAnimationFrame = realRaf
  delete (window as unknown as Record<string, unknown>).openposDesktop
})

describe('main', () => {
  it('renders the app and notifies the desktop host', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    const rendererReady = vi.fn()
    ;(window as unknown as Record<string, unknown>).openposDesktop = { startup: { rendererReady } }
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0)
      return 0
    }) as typeof requestAnimationFrame

    vi.resetModules()
    await import('./main')

    expect(document.getElementById('root')?.textContent).toContain('app')
    expect(rendererReady).toHaveBeenCalledTimes(1)
  })

  it('throws when the root element is missing', async () => {
    vi.resetModules()

    await expect(import('./main')).rejects.toThrow("Root element with id 'root' not found")
  })
})
