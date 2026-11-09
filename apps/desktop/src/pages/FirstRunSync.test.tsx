// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }),
}))
vi.mock('../lib/platform', () => ({ isDesktop: false }))
vi.mock('../lib/desktop', () => ({ getDesktopApi: () => null }))

const { default: FirstRunSync } = await import('./FirstRunSync')
const { appSettingsStore } = await import('../stores/appSettings/appSettingsStore')

afterEach(cleanup)

describe('FirstRunSync', () => {
  it('shows the syncing state', () => {
    appSettingsStore.appName.value = 'Test Shop'
    render(
      <FirstRunSync
        status={{ status: 'syncingInitialData', remoteConfigured: true, apiUrl: '', activeUserCount: 0 }}
        isRetrying={false}
        onRetry={async () => {}}
      />,
    )

    expect(screen.getByText('Test Shop')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'startup.syncingTitle' })).toBeTruthy()
    expect(screen.getByText('startup.syncingDescription')).toBeTruthy()
    expect(screen.getByText('common.yes')).toBeTruthy()
    expect(screen.queryByText('startup.apiUrlLabel')).toBeNull()
    expect(screen.queryByRole('button', { name: 'startup.retry' })).toBeNull()
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('shows failures with retry and diagnostics', () => {
    const onRetry = vi.fn(async () => {})
    const { rerender } = render(
      <FirstRunSync
        status={{
          status: 'initialSyncFailed',
          remoteConfigured: false,
          apiUrl: 'https://api.example.com',
          activeUserCount: 2,
          lastError: 'boom',
        }}
        isRetrying={false}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText('startup.initialSyncFailedTitle')).toBeTruthy()
    expect(screen.getByText('boom')).toBeTruthy()
    expect(screen.getByText('https://api.example.com')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'startup.retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)

    rerender(
      <FirstRunSync
        status={{ status: 'initialSyncFailed', remoteConfigured: false, activeUserCount: 0 }}
        isRetrying={true}
        onRetry={onRetry}
      />,
    )
    expect(screen.queryByText('boom')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /startup\.retry/ }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
