import { useState } from 'preact/hooks'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'
import { clearLocalClientState } from '../services/connections'
import { Button, Dialog } from './ui'

/** Wipe local keys and connection state, then return to first-run setup. Turso is not deleted. */
export function DangerZoneCard() {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  const handleReset = async () => {
    try {
      setIsResetting(true)
      if (isDesktop) {
        await requireDesktopApi().connection.factoryReset()
      }
      signOut()
      clearLocalClientState()
      window.location.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.dangerZoneFailed'))
      setIsResetting(false)
    }
  }

  return (
    <div class="rounded-cards border border-danger bg-danger-soft p-5">
      <h3 class="mb-1 text-lg font-medium text-danger">{t('settings.dangerZone')}</h3>
      <p class="mb-3 text-sm text-danger">{t('settings.dangerZoneDesc')}</p>
      <p class="mb-4 text-sm text-danger">{t('settings.dangerZoneTursoKept')}</p>
      <Button
        variant="danger"
        onClick={() => setIsDialogOpen(true)}
        disabled={isResetting}
        class="bg-danger text-white border-danger hover:opacity-90"
      >
        {isResetting ? t('settings.dangerZoneResetting') : t('settings.dangerZoneReset')}
      </Button>

      <Dialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} title={t('settings.dangerZone')} size="md">
        <div class="space-y-4">
          <div class="flex items-center space-x-3 rounded-cards border border-danger bg-danger-soft p-4 text-danger">
            <span class="text-2xl">⚠️</span>
            <div>
              <span class="font-semibold">{t('settings.dangerZoneConfirm')}</span>
              <span class="block text-sm">{t('settings.dangerZoneWarning')}</span>
            </div>
          </div>
          <ul class="ml-4 list-disc list-inside space-y-1 text-sm text-danger">
            <li>{t('settings.dangerZoneItem1')}</li>
            <li>{t('settings.dangerZoneItem2')}</li>
            <li>{t('settings.dangerZoneItem3')}</li>
            <li>{t('settings.dangerZoneItem4')}</li>
          </ul>
          <span class="font-medium text-danger">{t('settings.dangerZoneProceed')}</span>
        </div>
        <div class="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-danger pt-6">
          <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isResetting}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleReset}
            disabled={isResetting}
            variant="danger"
            class="bg-danger text-white border-danger hover:opacity-90"
          >
            {isResetting ? t('settings.dangerZoneResetting') : t('settings.dangerZoneReset')}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
