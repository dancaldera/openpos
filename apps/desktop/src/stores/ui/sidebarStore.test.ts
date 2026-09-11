// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setSidebarCollapsed, sidebarCollapsed } from './sidebarStore'

afterEach(() => {
  localStorage.clear()
  setSidebarCollapsed(false)
})

describe('sidebarStore', () => {
  it('persists the collapsed flag', () => {
    expect(sidebarCollapsed.value).toBe(false)

    setSidebarCollapsed(true)
    expect(sidebarCollapsed.value).toBe(true)
    expect(localStorage.getItem('sidebar_collapsed')).toBe('1')

    setSidebarCollapsed(false)
    expect(sidebarCollapsed.value).toBe(false)
    expect(localStorage.getItem('sidebar_collapsed')).toBe('0')
  })

  it('reads the initial flag from storage', async () => {
    localStorage.setItem('sidebar_collapsed', '1')

    vi.resetModules()
    const fresh = await import('./sidebarStore.ts')
    expect(fresh.sidebarCollapsed.value).toBe(true)
  })
})
