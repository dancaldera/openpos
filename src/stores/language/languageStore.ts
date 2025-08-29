import { signal } from '@preact/signals'

export const languageStore = {
  currentLocale: signal<string>('en'),
  isLoading: signal<boolean>(false),
  availableLocales: signal<string[]>(['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja']),
}
