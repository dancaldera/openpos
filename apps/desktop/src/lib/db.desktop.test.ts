import { describe, expect, it, vi } from 'vitest'

vi.mock('./platform', () => ({
  isDesktop: true,
  isElectron: true,
  isWeb: false,
}))

const { connectionMode, setApiState, setConnectionState } = await import('./db')

describe('db desktop defaults', () => {
  it('defaults to mirror mode on desktop', () => {
    setConnectionState('online')

    expect(connectionMode.value).toBe('mirror')
  })

  it('accepts empty api state', () => {
    setApiState()

    expect(connectionMode.value).toBe('mirror')
  })
})
