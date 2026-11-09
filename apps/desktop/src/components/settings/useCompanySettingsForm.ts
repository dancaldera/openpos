import { useEffect, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { toast } from '../../lib/toast'
import { type CompanySettings, companySettingsService } from '../../services/company-settings-turso'
import { appSettingsStore } from '../../stores/appSettings/appSettingsStore'

/** The app name is fixed; it is written back on every save so it never drifts. */
export const FIXED_APP_NAME = 'OpenPOS'

/** Store fields edited on the General tab. Theme and language save on their own. */
export interface CompanyDraft {
  name: string
  description: string
  address: string
  phone: string
  email: string
  website: string
  taxEnabled: boolean
  taxPercentage: number
  currencySymbol: string
}

function draftFrom(settings: CompanySettings): CompanyDraft {
  return {
    name: settings.name,
    description: settings.description || '',
    address: settings.address || '',
    phone: settings.phone || '',
    email: settings.email || '',
    website: settings.website || '',
    taxEnabled: settings.taxEnabled,
    taxPercentage: settings.taxPercentage,
    currencySymbol: settings.currencySymbol,
  }
}

export interface CompanySettingsForm {
  draft: CompanyDraft | null
  isLoading: boolean
  loadError: string
  saveError: string
  isSaving: boolean
  isDirty: boolean
  setField: <K extends keyof CompanyDraft>(field: K, value: CompanyDraft[K]) => void
  save: () => Promise<void>
  discard: () => void
  resetToDefaults: () => Promise<void>
  clearSaveError: () => void
}

/**
 * Loads the company settings once and keeps the edits in the page, so switching
 * settings tabs does not lose unsaved changes.
 */
export function useCompanySettingsForm(): CompanySettingsForm {
  const { t } = useTranslation()
  const [saved, setSaved] = useState<CompanyDraft | null>(null)
  const [draft, setDraft] = useState<CompanyDraft | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const adopt = (settings: CompanySettings) => {
    const next = draftFrom(settings)
    setSaved(next)
    setDraft(next)
    appSettingsStore.appName.value = FIXED_APP_NAME
    appSettingsStore.companyName.value = settings.name
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once; `t` is a new function on every render
  useEffect(() => {
    let isCancelled = false
    companySettingsService
      .getSettings()
      .then((settings) => {
        if (isCancelled) return
        const next = draftFrom(settings)
        setSaved(next)
        setDraft(next)
      })
      .catch((error: unknown) => {
        if (!isCancelled) setLoadError(error instanceof Error ? error.message : t('errors.generic'))
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false)
      })
    return () => {
      isCancelled = true
    }
  }, [])

  const isDirty = draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)

  const setField = <K extends keyof CompanyDraft>(field: K, value: CompanyDraft[K]) => {
    setDraft((previous) => (previous ? { ...previous, [field]: value } : previous))
  }

  const save = async () => {
    if (!draft) return
    setIsSaving(true)
    setSaveError('')
    try {
      const result = await companySettingsService.updateSettings({
        ...draft,
        name: draft.name.trim(),
        appName: FIXED_APP_NAME,
      })
      if (result.success && result.settings) {
        adopt(result.settings)
        toast.success(t('settings.settingsUpdated'))
      } else {
        setSaveError(result.error || t('errors.generic'))
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('errors.generic'))
    } finally {
      setIsSaving(false)
    }
  }

  const resetToDefaults = async () => {
    setIsSaving(true)
    setSaveError('')
    try {
      const result = await companySettingsService.resetToDefaults()
      if (result.success && result.settings) {
        adopt(result.settings)
        toast.success(t('success.updated'))
      } else {
        toast.error(result.error || t('errors.generic'))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.generic'))
    } finally {
      setIsSaving(false)
    }
  }

  return {
    draft,
    isLoading,
    loadError,
    saveError,
    isSaving,
    isDirty,
    setField,
    save,
    discard: () => {
      setDraft(saved)
      setSaveError('')
    },
    resetToDefaults,
    clearSaveError: () => setSaveError(''),
  }
}
