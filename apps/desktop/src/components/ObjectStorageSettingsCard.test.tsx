// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

interface ObjectStorageSettingsShape {
  configured: boolean
  endpoint: string | null
  region: string
  bucket: string | null
  urlTtlSeconds: number
  updatedAt: string | null
}

const { getSettingsMock, saveSettingsMock, clearSettingsMock, toastErrorMock, toastSuccessMock, isAdminHolder } =
  vi.hoisted(() => ({
    getSettingsMock: vi.fn(
      async (): Promise<ObjectStorageSettingsShape> => ({
        configured: true,
        endpoint: 'https://t3.storageapi.dev',
        region: 'auto',
        bucket: 'product-images',
        urlTtlSeconds: 900,
        updatedAt: null,
      }),
    ),
    saveSettingsMock: vi.fn(
      async (): Promise<ObjectStorageSettingsShape> => ({
        configured: true,
        endpoint: 'https://t3.storageapi.dev',
        region: 'auto',
        bucket: 'product-images',
        urlTtlSeconds: 900,
        updatedAt: null,
      }),
    ),
    clearSettingsMock: vi.fn(async () => {}),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    isAdminHolder: { value: true },
  }))

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ isAdmin: isAdminHolder.value }),
}))

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock },
}))

vi.mock('../services/object-storage-settings', () => ({
  objectStorageSettingsService: {
    getSettings: getSettingsMock,
    saveSettings: saveSettingsMock,
    clearSettings: clearSettingsMock,
  },
}))

const { ObjectStorageSettingsCard } = await import('./ObjectStorageSettingsCard')

function setInput(label: string, value: string) {
  // Required fields render the label with a trailing asterisk.
  fireEvent.input(screen.getByLabelText(label, { exact: false }), { target: { value } })
}

function getInput(label: string) {
  return screen.getByLabelText(label, { exact: false }) as HTMLInputElement
}

function submit() {
  const form = screen.getByRole('button', { name: 'settings.saveObjectStorageSettings' }).closest('form')
  if (!form) throw new Error('expected submit button inside a form')
  fireEvent.submit(form)
}

afterEach(() => {
  cleanup()
  isAdminHolder.value = true
  getSettingsMock.mockClear()
  saveSettingsMock.mockClear()
  clearSettingsMock.mockClear()
  toastErrorMock.mockClear()
  toastSuccessMock.mockClear()
})

describe('ObjectStorageSettingsCard', () => {
  it('renders nothing for non-admins', () => {
    isAdminHolder.value = false
    const { container } = render(<ObjectStorageSettingsCard />)
    expect(container.innerHTML).toBe('')
    expect(getSettingsMock).not.toHaveBeenCalled()
  })

  it('loads and shows the configured status', async () => {
    render(<ObjectStorageSettingsCard />)
    await screen.findByText('settings.objectStorageStatusConfigured')
    expect(getInput('settings.s3Endpoint').value).toBe('https://t3.storageapi.dev')
  })

  it('shows the loading state while fetching', async () => {
    let resolveLoad!: (value: Awaited<ReturnType<typeof getSettingsMock>>) => void
    getSettingsMock.mockImplementationOnce(
      () =>
        new Promise<Awaited<ReturnType<typeof getSettingsMock>>>((resolve) => {
          resolveLoad = resolve
        }),
    )
    render(<ObjectStorageSettingsCard />)
    await screen.findByText('settings.objectStorageLoading')
    resolveLoad({
      configured: false,
      endpoint: null,
      region: 'auto',
      bucket: null,
      urlTtlSeconds: 900,
      updatedAt: null,
    })
    await screen.findByText('settings.objectStorageStatusNotConfigured')
  })

  it('falls back to defaults for empty stored settings', async () => {
    getSettingsMock.mockResolvedValueOnce({
      configured: false,
      endpoint: null,
      region: '',
      bucket: null,
      urlTtlSeconds: 0,
      updatedAt: null,
    })
    render(<ObjectStorageSettingsCard />)
    await screen.findByText('settings.objectStorageStatusNotConfigured')
    expect(getInput('settings.s3Endpoint').value).toBe('')
    expect(getInput('settings.s3Region').value).toBe('auto')
    expect(getInput('settings.s3SignedUrlTtl').value).toBe('900')
  })

  it('reports load failures', async () => {
    getSettingsMock.mockRejectedValueOnce(new Error('down'))
    render(<ObjectStorageSettingsCard />)
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('down'))
    cleanup()

    getSettingsMock.mockRejectedValueOnce('string-failure')
    render(<ObjectStorageSettingsCard />)
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('settings.objectStorageSettingsFailed'))
  })

  it('requires endpoint, region, and bucket', async () => {
    render(<ObjectStorageSettingsCard />)
    await screen.findByText('settings.objectStorageStatusConfigured')

    setInput('settings.s3Endpoint', '')
    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('settings.objectStorageFieldsRequired'))
    expect(saveSettingsMock).not.toHaveBeenCalled()
  })

  it('requires credentials until configured', async () => {
    getSettingsMock.mockResolvedValueOnce({
      configured: false,
      endpoint: null,
      region: 'auto',
      bucket: null,
      urlTtlSeconds: 900,
      updatedAt: null,
    })
    render(<ObjectStorageSettingsCard />)
    await screen.findByText('settings.objectStorageStatusNotConfigured')

    setInput('settings.s3Endpoint', 'https://t3.storageapi.dev')
    setInput('settings.s3Region', 'auto')
    setInput('settings.s3Bucket', 'images')
    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('settings.objectStorageCredentialsRequired'))
    expect(saveSettingsMock).not.toHaveBeenCalled()
  })

  it('rejects invalid TTL values', async () => {
    render(<ObjectStorageSettingsCard />)
    await screen.findByText('settings.objectStorageStatusConfigured')

    setInput('settings.s3Endpoint', 'https://t3.storageapi.dev')
    setInput('settings.s3Region', 'auto')
    setInput('settings.s3Bucket', 'images')
    setInput('settings.s3AccessKeyId', 'key')
    setInput('settings.s3SecretAccessKey', 'secret')

    for (const ttl of ['0', '604801', 'abc', '1.5']) {
      setInput('settings.s3SignedUrlTtl', ttl)
      submit()
      await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('settings.objectStorageTtlInvalid'))
    }
    expect(saveSettingsMock).not.toHaveBeenCalled()
  })

  it('saves trimmed settings and clears the secrets', async () => {
    render(<ObjectStorageSettingsCard />)
    await screen.findByText('settings.objectStorageStatusConfigured')

    setInput('settings.s3Endpoint', '  https://t3.storageapi.dev  ')
    setInput('settings.s3Region', 'auto')
    setInput('settings.s3Bucket', '  images  ')
    setInput('settings.s3AccessKeyId', 'key')
    setInput('settings.s3SecretAccessKey', 'secret')
    setInput('settings.s3SignedUrlTtl', '1800')
    submit()

    await vi.waitFor(() =>
      expect(saveSettingsMock).toHaveBeenCalledWith({
        endpoint: 'https://t3.storageapi.dev',
        region: 'auto',
        bucket: 'images',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        urlTtlSeconds: 1800,
      }),
    )
    expect(toastSuccessMock).toHaveBeenCalledWith('settings.objectStorageSettingsSaved')
    await vi.waitFor(() => {
      expect(getInput('settings.s3AccessKeyId').value).toBe('')
      expect(getInput('settings.s3SecretAccessKey').value).toBe('')
    })
  })

  it('reports save failures', async () => {
    render(<ObjectStorageSettingsCard />)
    await screen.findByText('settings.objectStorageStatusConfigured')

    saveSettingsMock.mockRejectedValueOnce(new Error('nope'))
    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('nope'))

    saveSettingsMock.mockRejectedValueOnce('string-failure')
    submit()
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('settings.objectStorageSettingsFailed'))
  })

  it('clears settings through the confirmation dialog', async () => {
    render(<ObjectStorageSettingsCard />)
    await screen.findByText('settings.objectStorageStatusConfigured')

    fireEvent.click(screen.getByRole('button', { name: 'settings.objectStorageClear' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'settings.objectStorageClear' })[1])

    await vi.waitFor(() => expect(clearSettingsMock).toHaveBeenCalled())
    expect(toastSuccessMock).toHaveBeenCalledWith('settings.objectStorageSettingsCleared')
    await screen.findByText('settings.objectStorageStatusNotConfigured')
  })

  it('cancels the clear confirmation and reports clear failures', async () => {
    render(<ObjectStorageSettingsCard />)
    await screen.findByText('settings.objectStorageStatusConfigured')

    fireEvent.click(screen.getByRole('button', { name: 'settings.objectStorageClear' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(clearSettingsMock).not.toHaveBeenCalled()

    clearSettingsMock.mockRejectedValueOnce(new Error('locked'))
    fireEvent.click(screen.getByRole('button', { name: 'settings.objectStorageClear' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'settings.objectStorageClear' })[1])
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('locked'))

    clearSettingsMock.mockRejectedValueOnce('string-failure')
    fireEvent.click(screen.getByRole('button', { name: 'settings.objectStorageClear' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'settings.objectStorageClear' })[1])
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('settings.objectStorageSettingsFailed'))
  })

  it('hides the clear button when nothing is configured', async () => {
    getSettingsMock.mockResolvedValueOnce({
      configured: false,
      endpoint: null,
      region: 'auto',
      bucket: null,
      urlTtlSeconds: 900,
      updatedAt: null,
    })
    render(<ObjectStorageSettingsCard />)
    await screen.findByText('settings.objectStorageStatusNotConfigured')
    expect(screen.queryByRole('button', { name: 'settings.objectStorageClear' })).toBeNull()
  })
})
