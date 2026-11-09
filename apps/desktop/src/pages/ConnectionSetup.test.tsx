// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopFirstRunStatus } from '../lib/desktop'

const mocks = vi.hoisted(() => ({
  platform: { isDesktop: false },
  connectWithKey: vi.fn(),
  resetApiUrlCache: vi.fn(),
  getConfig: vi.fn(),
  factoryReset: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }),
}))

vi.mock('../lib/platform', () => ({
  get isDesktop() {
    return mocks.platform.isDesktop
  },
}))

vi.mock('../lib/desktop', () => ({
  getDesktopApi: () => null,
  requireDesktopApi: () => ({
    getConfig: mocks.getConfig,
    connection: { factoryReset: mocks.factoryReset },
  }),
}))

vi.mock('../lib/api-config', () => ({ resetApiUrlCache: mocks.resetApiUrlCache }))
vi.mock('../services/connections', () => ({ connectWithKey: mocks.connectWithKey }))
vi.mock('../lib/toast', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, info: vi.fn(), warning: vi.fn() },
}))

const { default: ConnectionSetup } = await import('./ConnectionSetup')

const KEY_PLACEHOLDER = 'OPK_XXXX-XXXX-XXXX-XXXX'
const API_PLACEHOLDER = 'https://api.pos.softmelody.dev'

function needsConnection(apiUrl?: string): DesktopFirstRunStatus {
  return { status: 'needsConnection', remoteConfigured: false, activeUserCount: 0, apiUrl }
}

function typeInto(placeholder: string, value: string) {
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } })
}

function submit() {
  const form = screen.getByPlaceholderText(KEY_PLACEHOLDER).closest('form')
  if (!form) throw new Error('form not rendered')
  fireEvent.submit(form)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

beforeEach(() => {
  mocks.platform.isDesktop = false
  mocks.getConfig.mockResolvedValue({ apiUrl: '' })
})

afterEach(() => {
  cleanup()
  for (const mock of [
    mocks.connectWithKey,
    mocks.resetApiUrlCache,
    mocks.getConfig,
    mocks.factoryReset,
    mocks.toastSuccess,
    mocks.toastError,
  ]) {
    mock.mockReset()
  }
})

describe('ConnectionSetup on the web', () => {
  it('shows only the key field and connects with it', async () => {
    const onResolved = vi.fn(async () => {})
    mocks.connectWithKey.mockResolvedValueOnce({ key: 'OPK_A', storeName: 'Harbor' })

    render(<ConnectionSetup status={null} onResolved={onResolved} />)

    expect(screen.getByText('connection.title')).toBeTruthy()
    expect(screen.getByText('connection.webSubtitle')).toBeTruthy()
    expect(screen.queryByPlaceholderText(API_PLACEHOLDER)).toBeNull()
    expect(screen.queryByRole('button', { name: 'connection.factoryReset' })).toBeNull()
    expect(mocks.getConfig).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)

    typeInto(KEY_PLACEHOLDER, 'OPK_A')
    submit()

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(undefined))
    expect(mocks.connectWithKey).toHaveBeenCalledWith({ key: 'OPK_A', apiUrl: '' })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('connection.joined {"name":"Harbor"}')
    expect(mocks.resetApiUrlCache).not.toHaveBeenCalled()
  })

  it('shows the connecting state while the request runs', async () => {
    const pending = deferred<{ key: string; storeName: string }>()
    mocks.connectWithKey.mockReturnValueOnce(pending.promise)

    render(<ConnectionSetup status={null} onResolved={vi.fn()} />)
    typeInto(KEY_PLACEHOLDER, 'OPK_A')
    submit()

    expect(await screen.findByRole('button', { name: /connection\.connecting/ })).toBeTruthy()
    submit()
    expect(mocks.connectWithKey).toHaveBeenCalledTimes(1)

    await act(async () => {
      pending.resolve({ key: 'OPK_A', storeName: 'Harbor' })
    })
    expect(await screen.findByRole('button', { name: 'connection.connect' })).toBeTruthy()
  })

  it.each([
    [new Error('invalid_connection_key'), 'connection.invalidKey'],
    [new Error('connection_not_found'), 'connection.keyNotFound'],
    [new Error('Server exploded'), 'Server exploded'],
    [new Error(''), 'connection.connectFailed'],
    ['not an error', 'connection.connectFailed'],
  ])('maps connect failure %s to %s', async (failure, message) => {
    const onResolved = vi.fn()
    mocks.connectWithKey.mockRejectedValueOnce(failure)

    render(<ConnectionSetup status={null} onResolved={onResolved} />)
    typeInto(KEY_PLACEHOLDER, 'OPK_bad')
    submit()

    expect(await screen.findByText(message)).toBeTruthy()
    expect(onResolved).not.toHaveBeenCalled()
  })

  it('clears the error when the key changes', async () => {
    mocks.connectWithKey.mockRejectedValueOnce(new Error('connection_not_found'))

    render(<ConnectionSetup status={null} onResolved={vi.fn()} />)
    typeInto(KEY_PLACEHOLDER, 'OPK_bad')
    submit()
    expect(await screen.findByText('connection.keyNotFound')).toBeTruthy()

    typeInto(KEY_PLACEHOLDER, 'OPK_other')

    expect(screen.queryByText('connection.keyNotFound')).toBeNull()
  })
})

describe('ConnectionSetup on desktop', () => {
  beforeEach(() => {
    mocks.platform.isDesktop = true
  })

  it('requires an API URL before connecting', async () => {
    render(<ConnectionSetup status={needsConnection()} onResolved={vi.fn()} />)

    expect(screen.getByText('connection.subtitle')).toBeTruthy()
    await waitFor(() => expect(mocks.getConfig).toHaveBeenCalled())
    typeInto(KEY_PLACEHOLDER, 'OPK_A')
    typeInto(API_PLACEHOLDER, '   ')
    submit()

    expect(await screen.findByText('connection.apiUrlRequired')).toBeTruthy()
    expect(mocks.connectWithKey).not.toHaveBeenCalled()

    typeInto(API_PLACEHOLDER, 'https://api.example.com')
    expect(screen.queryByText('connection.apiUrlRequired')).toBeNull()
  })

  it('prefills the API URL from the startup status without reading the config', () => {
    render(<ConnectionSetup status={needsConnection('https://status.example.com')} onResolved={vi.fn()} />)

    expect((screen.getByPlaceholderText(API_PLACEHOLDER) as HTMLInputElement).value).toBe('https://status.example.com')
    expect(mocks.getConfig).not.toHaveBeenCalled()
  })

  it('prefills the API URL from the desktop config', async () => {
    mocks.getConfig.mockResolvedValueOnce({ apiUrl: 'https://config.example.com' })

    render(<ConnectionSetup status={null} onResolved={vi.fn()} />)

    await waitFor(() =>
      expect((screen.getByPlaceholderText(API_PLACEHOLDER) as HTMLInputElement).value).toBe(
        'https://config.example.com',
      ),
    )
  })

  it('keeps a typed API URL over a late config value', async () => {
    const config = deferred<{ apiUrl: string }>()
    mocks.getConfig.mockReturnValueOnce(config.promise)

    render(<ConnectionSetup status={null} onResolved={vi.fn()} />)
    typeInto(API_PLACEHOLDER, 'https://typed.example.com')
    await act(async () => {
      config.resolve({ apiUrl: 'https://config.example.com' })
    })

    expect((screen.getByPlaceholderText(API_PLACEHOLDER) as HTMLInputElement).value).toBe('https://typed.example.com')
  })

  it('ignores config failures', async () => {
    mocks.getConfig.mockRejectedValueOnce(new Error('no ipc'))
    render(<ConnectionSetup status={null} onResolved={vi.fn()} />)
    await waitFor(() => expect(mocks.getConfig).toHaveBeenCalledTimes(1))
    expect((screen.getByPlaceholderText(API_PLACEHOLDER) as HTMLInputElement).value).toBe('')
  })

  it('connects with the API URL, resets the API cache, and passes the new status on', async () => {
    const onResolved = vi.fn(async () => {})
    const status: DesktopFirstRunStatus = { status: 'syncingInitialData', remoteConfigured: true, activeUserCount: 0 }
    mocks.connectWithKey.mockResolvedValueOnce({ key: 'OPK_A', storeName: 'Tienda', status })

    render(<ConnectionSetup status={needsConnection('https://api.example.com')} onResolved={onResolved} />)
    typeInto(KEY_PLACEHOLDER, 'OPK_A')
    submit()

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(status))
    expect(mocks.connectWithKey).toHaveBeenCalledWith({ key: 'OPK_A', apiUrl: 'https://api.example.com' })
    expect(mocks.resetApiUrlCache).toHaveBeenCalledTimes(1)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('connection.joined {"name":"Tienda"}')
  })

  it('factory resets only after an in-page confirmation', async () => {
    const onResolved = vi.fn(async () => {})
    mocks.factoryReset.mockResolvedValueOnce(needsConnection())

    render(<ConnectionSetup status={needsConnection('https://api.example.com')} onResolved={onResolved} />)

    fireEvent.click(screen.getByRole('button', { name: 'connection.factoryReset' }))
    expect(mocks.factoryReset).not.toHaveBeenCalled()
    expect(screen.getByText('connection.factoryResetTitle')).toBeTruthy()
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'connection.factoryResetConfirm' }))

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(needsConnection()))
    expect(mocks.factoryReset).toHaveBeenCalledTimes(1)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('connection.factoryResetDone')
  })

  it('cancels the factory reset', () => {
    render(<ConnectionSetup status={needsConnection('https://api.example.com')} onResolved={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'connection.factoryReset' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))

    expect(screen.getByRole('button', { name: 'connection.factoryReset' })).toBeTruthy()
    expect(mocks.factoryReset).not.toHaveBeenCalled()
  })

  it.each([
    [new Error('reset failed'), 'reset failed'],
    ['kaput', 'connection.factoryResetFailed'],
  ])('reports factory reset failure %s', async (failure, message) => {
    const onResolved = vi.fn()
    mocks.factoryReset.mockRejectedValueOnce(failure)

    render(<ConnectionSetup status={needsConnection('https://api.example.com')} onResolved={onResolved} />)
    fireEvent.click(screen.getByRole('button', { name: 'connection.factoryReset' }))
    fireEvent.click(screen.getByRole('button', { name: 'connection.factoryResetConfirm' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(message))
    expect(onResolved).not.toHaveBeenCalled()
  })
})
