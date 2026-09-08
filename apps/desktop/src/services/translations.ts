import { signal } from '@preact/signals'

export interface TranslationKeys {
  [key: string]: string | TranslationKeys
}

export interface Locale {
  code: string
  name: string
  nativeName: string
  flag: string
  rtl?: boolean
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

type TranslationModule = {
  default: TranslationKeys
}

export type TranslationLoader = (locale: string) => Promise<TranslationKeys>

export const SUPPORTED_LOCALES: Locale[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
]

const PREFERRED_LANGUAGE_KEY = 'preferred-language'

function getStorage(): StorageLike | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
}

const defaultTranslationLoader: TranslationLoader = async (locale) => {
  const translation = (await import(`../locales/${locale}.json`)) as TranslationModule
  return translation.default
}

export class TranslationService {
  private translations = signal<Record<string, TranslationKeys>>({})
  private currentLocale = signal<string>('en')
  private fallbackLocale = 'en'

  constructor(
    private readonly loadLocale: TranslationLoader = defaultTranslationLoader,
    private readonly storage: StorageLike | null = getStorage(),
  ) {}

  async loadTranslation(locale: string): Promise<void> {
    try {
      this.translations.value = {
        ...this.translations.value,
        [locale]: await this.loadLocale(locale),
      }
    } catch (error) {
      console.warn(`Failed to load translation for ${locale}:`, error)
    }
  }

  async setLocale(locale: string): Promise<void> {
    if (!this.translations.value[locale]) {
      await this.loadTranslation(locale)
    }
    this.currentLocale.value = locale
    this.storage?.setItem(PREFERRED_LANGUAGE_KEY, locale)
  }

  t(key: string, params?: Record<string, string | number | boolean>): string {
    const translation =
      this.getTranslation(key, this.currentLocale.value) || this.getTranslation(key, this.fallbackLocale) || key

    return this.interpolate(translation, params)
  }

  private getTranslation(key: string, locale: string): string | null {
    const keys = key.split('.')
    let current: unknown = this.translations.value[locale]

    for (const k of keys) {
      if (!current || typeof current !== 'object') return null
      // current is an object at this point; index with k safely
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      current = (current as Record<string, unknown>)[k]
    }

    return typeof current === 'string' ? current : null
  }

  private interpolate(text: string, params?: Record<string, string | number | boolean>): string {
    if (!params) return text

    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = params[key]
      return value === undefined || value === null ? match : String(value)
    })
  }

  getCurrentLocale(): string {
    return this.currentLocale.value
  }

  getSupportedLocales(): Locale[] {
    return SUPPORTED_LOCALES
  }

  async initialize(): Promise<void> {
    const savedLocale = this.storage?.getItem(PREFERRED_LANGUAGE_KEY) || 'en'
    await this.setLocale(savedLocale)
  }
}

export const translationService = new TranslationService()
