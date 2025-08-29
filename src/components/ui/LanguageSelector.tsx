import { useTranslation } from '../../hooks/useTranslation'
import { languageActions } from '../../stores/language/languageActions'
import Select from './Select'

interface LanguageSelectorProps {
  class?: string
}

export default function LanguageSelector({ class: className }: LanguageSelectorProps) {
  const { getCurrentLocale, getSupportedLocales, t } = useTranslation()

  const handleLanguageChange = async (e: Event) => {
    const target = e.target as HTMLSelectElement
    const locale = target.value
    if (locale) {
      await languageActions.changeLanguage(locale)
    }
  }

  const supportedLocales = getSupportedLocales()
  const currentLocale = getCurrentLocale()

  const options = supportedLocales.map((locale) => ({
    value: locale.code,
    label: `${locale.flag} ${locale.nativeName}`,
  }))

  return (
    <div class={className}>
      <Select label={t('settings.language')} value={currentLocale} onChange={handleLanguageChange} options={options} />
    </div>
  )
}
