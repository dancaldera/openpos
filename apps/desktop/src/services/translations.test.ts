import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { type TranslationKeys, type TranslationLoader, TranslationService } from './translations'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

function createLoader(translations: Record<string, TranslationKeys>): TranslationLoader {
  return mock(async (locale: string) => {
    const translation = translations[locale]
    if (!translation) {
      throw new Error(`Missing locale: ${locale}`)
    }
    return translation
  })
}

describe('TranslationService', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it('returns the key when no translation exists', async () => {
    const service = new TranslationService(createLoader({ en: {} }), storage)

    await service.setLocale('en')

    expect(service.t('missing.key')).toBe('missing.key')
  })

  it('falls back to english when the current locale is missing a key', async () => {
    const service = new TranslationService(
      createLoader({
        en: { common: { save: 'Save' } },
        es: { common: {} },
      }),
      storage,
    )

    await service.setLocale('en')
    await service.setLocale('es')

    expect(service.t('common.save')).toBe('Save')
  })

  it('interpolates placeholders', async () => {
    const service = new TranslationService(
      createLoader({
        en: { greeting: { welcome: 'Hello, {{name}}!' } },
      }),
      storage,
    )

    await service.setLocale('en')

    expect(service.t('greeting.welcome', { name: 'Ana' })).toBe('Hello, Ana!')
  })

  it('initializes from persisted locale preference', async () => {
    storage.setItem('preferred-language', 'es')
    const service = new TranslationService(
      createLoader({
        en: { common: { save: 'Save' } },
        es: { common: { save: 'Guardar' } },
      }),
      storage,
    )

    await service.initialize()

    expect(service.getCurrentLocale()).toBe('es')
    expect(service.t('common.save')).toBe('Guardar')
  })
})
