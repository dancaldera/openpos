// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

interface DatabaseSettingsShape {
  configured: boolean
  hostedProvisioning: boolean
  databaseUrl: string | null
  org: string | null
  group: string | null
  updatedAt: string | null
}

const { getSettingsMock, saveSettingsMock, clearSettingsMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  getSettingsMock: vi.fn(
    async (): Promise<DatabaseSettingsShape> => ({
      configured: true,
      hostedProvisioning: true,
      databaseUrl: 'libsql://store.turso.io',
      org: 'my-org',
      group: 'default',
      updatedAt: null,
    }),
  ),
  saveSettingsMock: vi.fn(
    async (): Promise<DatabaseSettingsShape> => ({
      configured: true,
      hostedProvisioning: true,
      databaseUrl: 'libsql://store.turso.io',
      org: 'my-org',
      group: 'default',
      updatedAt: null,
    }),
  ),
  clearSettingsMock: vi.fn(async () => {}),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}))

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ isAdmin: true }),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: true,
}))

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock },
}))

vi.mock('../services/database-settings', () => ({
  databaseSettingsService: {
    getSettings: getSettingsMock,
    saveSettings: saveSettingsMock,
    clearSettings: clearSettingsMock,
  },
}))

const { DatabaseSettingsCard } = await import('./DatabaseSettingsCard')

function setInput(label: string, value: string) {
  fireEvent.input(screen.getByLabelText(label), { target: { value } })
}

function submit() {
  const form = screen.getByRole('button', { name: 'settings.saveDatabaseSettings' }).closest('form')
  if (!form) throw new Error('expected submit button inside a form')
  fireEvent.submit(form)
}

afterEach(() => {
  cleanup()
  getSettingsMock.mockClear()
  saveSettingsMock.mockClear()
  clearSettingsMock.mockClear()
  toastErrorMock.mockClear()
  toastSuccessMock.mockClear()
})

describe('DatabaseSettingsCard', () => {
  it('loads and shows the configured status', async () => {
    render(<DatabaseSettingsCard />)
    await screen.findByText('settings.databaseStatusConfigured')
    expect((screen.getByLabelText('settings.databaseUrl') as HTMLInputElement).value).toBe('libsql://store.turso.io')
  })

  it('shows the loading state while fetching', async () => {
    let resolveLoad!: (value: Awaited<ReturnType<typeof getSettingsMock>>) => void
    getSettingsMock.mockImplementationOnce(
      () =>
        new Promise<Awaited<ReturnType<typeof getSettingsMock>>>((resolve) => {
          resolveLoad = resolve
        }),
    )
    render(<DatabaseSettingsCard />)
    await screen.findByText('settings.databaseLoading')
    resolveLoad({
      configured: false,
      hostedProvisioning: false,
      databaseUrl: null,
      org: null,
      group: null,
      updatedAt: null,
    })
    await screen.findByText('settings.databaseStatusNotConfigured')
  })

  it('reports load failures', async () => {
    getSettingsMock.mockRejectedValueOnce(new Error('down'))
    render(<DatabaseSettingsCard />)
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('down'))
    cleanup()

    getSettingsMock.mockRejectedValueOnce('string-failure')
    render(<DatabaseSettingsCard />)
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('settings.databaseSettingsFailed'))
  })

  it('saves trimmed settings and clears the secrets', async () => {
    render(<DatabaseSettingsCard />)
    await screen.findByText('settings.databaseStatusConfigured')

    setInput('settings.databaseUrl', '  libsql://new.turso.io  ')
    setInput('settings.databaseAuthToken', '  token  ')
    setInput('settings.tursoApiToken', 'api-token')
    setInput('settings.tursoOrg', 'org')
    setInput('settings.tursoGroup', 'group')
    submit()

    await vi.waitFor(() =>
      expect(saveSettingsMock).toHaveBeenCalledWith({
        databaseUrl: 'libsql://new.turso.io',
        authToken: 'token',
        apiToken: 'api-token',
        org: 'org',
        group: 'group',
        publish: false,
      }),
    )
    expect(toastSuccessMock).toHaveBeenCalledWith('settings.databaseSettingsSaved')
    await vi.waitFor(() => {
      expect((screen.getByLabelText('settings.databaseAuthToken') as HTMLInputElement).value).toBe('')
      expect((screen.getByLabelText('settings.tursoApiToken') as HTMLInputElement).value).toBe('')
    })
  })

  it('saves empty fields as undefined', async () => {
    render(<DatabaseSettingsCard />)
    await screen.findByText('settings.databaseStatusConfigured')

    setInput('settings.databaseUrl', '')
    setInput('settings.databaseAuthToken', '')
    setInput('settings.tursoApiToken', '')
    setInput('settings.tursoOrg', '')
    setInput('settings.tursoGroup', '')
    submit()

    await vi.waitFor(() =>
      expect(saveSettingsMock).toHaveBeenCalledWith({
        databaseUrl: undefined,
        authToken: undefined,
        apiToken: undefined,
        org: undefined,
        group: undefined,
        publish: false,
      }),
    )
  })

  it('publishes when the publish button is used', async () => {
    render(<DatabaseSettingsCard />)
    await screen.findByText('settings.databaseStatusConfigured')

    fireEvent.click(screen.getByRole('button', { name: 'settings.publishDatabase' }))
    await vi.waitFor(() => expect(saveSettingsMock).toHaveBeenCalledWith(expect.objectContaining({ publish: true })))
  })

  it('reports save failures', async () => {
    render(<DatabaseSettingsCard />)
    await screen.findByText('settings.databaseStatusConfigured')

    saveSettingsMock.mockRejectedValueOnce(new Error('nope'))
    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('nope'))

    saveSettingsMock.mockRejectedValueOnce('string-failure')
    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('settings.databaseSettingsFailed'))
  })

  it('clears settings through the confirmation dialog', async () => {
    render(<DatabaseSettingsCard />)
    await screen.findByText('settings.databaseStatusConfigured')

    fireEvent.click(screen.getByRole('button', { name: 'settings.databaseClear' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'settings.databaseClear' })[1])

    await vi.waitFor(() => expect(clearSettingsMock).toHaveBeenCalled())
    expect(toastSuccessMock).toHaveBeenCalledWith('settings.databaseSettingsCleared')
    await screen.findByText('settings.databaseStatusNotConfigured')
  })

  it('cancels the clear confirmation', async () => {
    render(<DatabaseSettingsCard />)
    await screen.findByText('settings.databaseStatusConfigured')

    fireEvent.click(screen.getByRole('button', { name: 'settings.databaseClear' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(clearSettingsMock).not.toHaveBeenCalled()
  })

  it('reports clear failures', async () => {
    render(<DatabaseSettingsCard />)
    await screen.findByText('settings.databaseStatusConfigured')

    clearSettingsMock.mockRejectedValueOnce(new Error('locked'))
    fireEvent.click(screen.getByRole('button', { name: 'settings.databaseClear' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'settings.databaseClear' })[1])
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('locked'))

    clearSettingsMock.mockRejectedValueOnce('string-failure')
    fireEvent.click(screen.getByRole('button', { name: 'settings.databaseClear' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'settings.databaseClear' })[1])
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('settings.databaseSettingsFailed'))
  })

  it('hides the clear button when nothing is configured', async () => {
    getSettingsMock.mockResolvedValueOnce({
      configured: false,
      hostedProvisioning: false,
      databaseUrl: null,
      org: null,
      group: null,
      updatedAt: null,
    })
    render(<DatabaseSettingsCard />)
    await screen.findByText('settings.databaseStatusNotConfigured')
    expect(screen.queryByRole('button', { name: 'settings.databaseClear' })).toBeNull()
  })
})
