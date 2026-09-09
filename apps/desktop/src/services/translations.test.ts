import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  return vi.fn(async (locale: string) => {
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

  it('loads real locale files with the default loader', async () => {
    const service = new TranslationService()

    await service.loadTranslation('en')

    expect(service.getSupportedLocales().map((locale) => locale.code)).toEqual(['en', 'es'])
  })

  it('warns when a locale fails to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const service = new TranslationService(createLoader({}), storage)

      await service.loadTranslation('xx')

      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('skips reloading cached locales', async () => {
    const loader = createLoader({ en: { common: { save: 'Save' } } })
    const service = new TranslationService(loader, storage)

    await service.setLocale('en')
    await service.setLocale('en')

    expect(loader).toHaveBeenCalledTimes(1)
    expect(service.t('common.save')).toBe('Save')
  })

  it('initializes to english without a saved preference or storage', async () => {
    const service = new TranslationService(createLoader({ en: {} }), storage)
    await service.initialize()
    expect(service.getCurrentLocale()).toBe('en')

    const noStorage = new TranslationService(createLoader({ en: {} }), null)
    await noStorage.initialize()
    expect(noStorage.getCurrentLocale()).toBe('en')
  })

  it('keeps placeholders for missing, null, or undefined params', async () => {
    const service = new TranslationService(
      createLoader({
        en: { greeting: { welcome: 'Hello, {{name}}! You have {{count}} messages.' } },
      }),
      storage,
    )

    await service.setLocale('en')

    expect(service.t('greeting.welcome', { name: 'Ana', count: 3 })).toBe('Hello, Ana! You have 3 messages.')
    expect(service.t('greeting.welcome', { name: 'Ana' })).toBe('Hello, Ana! You have {{count}} messages.')
    expect(service.t('greeting.welcome', { name: null as unknown as string, count: 0 })).toBe(
      'Hello, {{name}}! You have 0 messages.',
    )
    expect(service.t('greeting.welcome', { name: undefined as unknown as string, count: false })).toBe(
      'Hello, {{name}}! You have false messages.',
    )
  })

  it('returns the key for nested object values and broken paths', async () => {
    const service = new TranslationService(
      createLoader({
        en: { common: { save: 'Save', nested: { deep: 'Deep' } } },
      }),
      storage,
    )

    await service.setLocale('en')

    expect(service.t('common')).toBe('common')
    expect(service.t('common.save.extra')).toBe('common.save.extra')
    expect(service.t('common.missing.deep')).toBe('common.missing.deep')
  })

  it('reads the persisted locale from global storage with the default loader', async () => {
    const memory = new MemoryStorage()
    memory.setItem('preferred-language', 'es')
    globalThis.localStorage = memory as unknown as Storage
    try {
      const service = new TranslationService()
      await service.initialize()
      expect(service.getCurrentLocale()).toBe('es')
    } finally {
      Reflect.deleteProperty(globalThis, 'localStorage')
    }
  })
})
