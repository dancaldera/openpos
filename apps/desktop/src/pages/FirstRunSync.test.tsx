// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  }),
}))

vi.mock('../components/ui/DbStatusBadge', () => ({
  DbStatusBadge: () => null,
}))

vi.mock('../components/ui/UpdateBadge', () => ({
  UpdateBadge: () => null,
}))

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

    expect(screen.getByText('Test Shop')).toBeDefined()
    expect(screen.getByText('startup.syncingTitle')).toBeDefined()
    expect(screen.getByText('startup.syncingDescription')).toBeDefined()
    expect(screen.queryByText('startup.retry')).toBeNull()
  })

  it('shows failures with retry and diagnostics', async () => {
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

    expect(screen.getByText('startup.initialSyncFailedTitle')).toBeDefined()
    expect(screen.getByText('boom')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'startup.retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)

    rerender(
      <FirstRunSync
        status={{ status: 'initialSyncFailed', remoteConfigured: false, activeUserCount: 0 }}
        isRetrying={true}
        onRetry={onRetry}
      />,
    )
    expect(screen.getByText('common.loading')).toBeDefined()
    expect(screen.queryByText('boom')).toBeNull()
  })
})
