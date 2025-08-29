import { useEffect } from 'preact/hooks'
import { translationService } from '../services/translations'

export function useTranslation() {
  useEffect(() => {
    translationService.initialize()
  }, [])

  return {
    t: (key: string, params?: Record<string, string | number | boolean>) => translationService.t(key, params),
    setLocale: (locale: string) => translationService.setLocale(locale),
    getCurrentLocale: () => translationService.getCurrentLocale(),
    getSupportedLocales: () => translationService.getSupportedLocales(),
  }
}
