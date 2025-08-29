import { signal } from '@preact/signals'

interface TranslationKeys {
  [key: string]: string | TranslationKeys
}

interface Locale {
  code: string
  name: string
  nativeName: string
  flag: string
  rtl?: boolean
}

export const SUPPORTED_LOCALES: Locale[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
]

class TranslationService {
  private translations = signal<Record<string, TranslationKeys>>({})
  private currentLocale = signal<string>('en')
  private fallbackLocale = 'en'

  async loadTranslation(locale: string): Promise<void> {
    try {
      const translation = await import(`../locales/${locale}.json`)
      this.translations.value = {
        ...this.translations.value,
        [locale]: translation.default,
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
    localStorage.setItem('preferred-language', locale)
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
    const savedLocale = localStorage.getItem('preferred-language') || 'en'
    await this.setLocale(savedLocale)
  }
}

export const translationService = new TranslationService()
