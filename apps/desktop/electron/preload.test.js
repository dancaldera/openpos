import { Module } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fakeElectron from '../test/mocks/electron.js'

const { contextBridge, ipcRenderer } = fakeElectron

const exposed = {}
contextBridge.exposeInMainWorld.mockImplementation((key, value) => {
  exposed[key] = value
})

const originalLoad = Module._load
// require('electron') inside electron/*.cjs bypasses Vite resolution, so
// intercept it at the Node loader level (restored right after import).
Module._load = function patchedLoad(request, ...args) {
  if (request === 'electron') {
    return fakeElectron
  }
  return originalLoad.call(this, request, ...args)
}

await import('./preload.cjs')

Module._load = originalLoad

function callAll(node) {
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'function') {
      if (key.startsWith('on')) continue
      value({ dummy: true }, 'extra', 123)
    } else if (value && typeof value === 'object') {
      callAll(value)
    }
  }
}

describe('preload', () => {
  beforeEach(() => {
    ipcRenderer.invoke.mockClear()
    ipcRenderer.send.mockClear()
    ipcRenderer.on.mockClear()
    ipcRenderer.removeListener.mockClear()
  })

  it('exposes the desktop flag', () => {
    expect(exposed.__OPENPOS_DESKTOP__).toEqual({ isElectron: true, platform: process.platform })
  })

  it('forwards every invoke bridge to its channel', () => {
    callAll(exposed.openposDesktop)

    const channels = ipcRenderer.invoke.mock.calls.map(([channel]) => channel)
    expect(channels).toContain('desktop:info')
    expect(channels).toContain('desktop:greet')
    expect(channels).toContain('desktop:hash-password')
    expect(channels).toContain('desktop:sync-trigger')
    expect(channels).toContain('desktop:connectivity-refresh')
    expect(channels).toContain('desktop:startup-initialize')
    expect(channels).toContain('desktop:connection-create')
    expect(channels).toContain('desktop:orders-sync-aggregate')
    expect(channels).toContain('desktop:db-transaction')
    expect(channels).toContain('desktop:image-resolve')
    expect(channels).toContain('desktop:theme')
    expect(channels).toContain('desktop:update-install-deb')
    expect(channels).toContain('desktop:update-restart-mac')
    expect(channels.length).toBeGreaterThan(40)
  })

  it('signals renderer readiness and survives early IPC', () => {
    exposed.openposDesktop.startup.rendererReady()
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      'desktop:renderer-signal',
      expect.objectContaining({ phase: 'painted' }),
    )

    ipcRenderer.send.mockImplementationOnce(() => {
      throw new Error('not ready')
    })
    expect(() => exposed.openposDesktop.startup.rendererReady()).not.toThrow()
  })

  it('subscribes and unsubscribes theme changes', () => {
    const cb = vi.fn()
    const unsubscribe = exposed.openposDesktop.theme.onChange(cb)

    expect(ipcRenderer.on).toHaveBeenCalledWith('desktop:theme-changed', expect.any(Function))
    const wrapped = ipcRenderer.on.mock.calls[0][1]
    wrapped({}, 'dark')
    expect(cb).toHaveBeenCalledWith('dark')

    unsubscribe()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('desktop:theme-changed', wrapped)
  })

  it('subscribes and unsubscribes navigation events', () => {
    const cb = vi.fn()
    const unsubscribe = exposed.openposDesktop.navigation.onNavigate(cb)

    const wrapped = ipcRenderer.on.mock.calls[0][1]
    wrapped({}, 'orders')
    expect(cb).toHaveBeenCalledWith('orders')

    unsubscribe()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('navigate', wrapped)
  })

  it('subscribes and unsubscribes update status', () => {
    const cb = vi.fn()
    const unsubscribe = exposed.openposDesktop.updates.onStatusChange(cb)

    const wrapped = ipcRenderer.on.mock.calls[0][1]
    wrapped({}, { status: 'ready' })
    expect(cb).toHaveBeenCalledWith({ status: 'ready' })

    unsubscribe()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('desktop:update-status', wrapped)
  })
})
