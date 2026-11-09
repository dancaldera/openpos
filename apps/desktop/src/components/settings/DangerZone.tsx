import { List, ListItem } from '@astryxdesign/core/List'
import { Text } from '@astryxdesign/core/Text'
import { useAuth } from '../../hooks/useAuth'
import { useTranslation } from '../../hooks/useTranslation'
import { requireDesktopApi } from '../../lib/desktop'
import { isDesktop } from '../../lib/platform'
import { toast } from '../../lib/toast'
import { clearLocalClientState } from '../../services/connections'
import { ConfirmAction } from '../page/ConfirmAction'
import { SettingsGroup } from './SettingsGroup'

const REMOVED_ITEM_KEYS = ['settings.dangerZoneItem1', 'settings.dangerZoneItem2', 'settings.dangerZoneItem3']

/** Wipe local keys and connection state, then return to first-run setup. The store database is kept. */
export function DangerZone() {
  const { t } = useTranslation()
  const { signOut } = useAuth()

  const reset = async () => {
    try {
      if (isDesktop) {
        await requireDesktopApi().connection.factoryReset()
      }
      signOut()
      clearLocalClientState()
      window.location.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.dangerZoneFailed'))
    }
  }

  return (
    <SettingsGroup title={t('settings.dangerZone')} description={t('settings.dangerZoneDesc')}>
      <List listStyle="disc" density="compact" edge="flush">
        {REMOVED_ITEM_KEYS.map((key) => (
          <ListItem key={key} label={t(key)} />
        ))}
      </List>
      <Text as="p" type="supporting">
        {t('settings.dangerZoneTursoKept')}
      </Text>
      <div>
        <ConfirmAction
          label={t('settings.dangerZoneReset')}
          title={t('settings.dangerZoneConfirm')}
          description={t('settings.dangerZoneWarning')}
          confirmLabel={t('settings.dangerZoneReset')}
          cancelLabel={t('common.cancel')}
          onConfirm={reset}
        />
      </div>
    </SettingsGroup>
  )
}
