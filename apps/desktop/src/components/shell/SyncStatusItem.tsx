import type { DropdownMenuItemData } from '@astryxdesign/core/DropdownMenu'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { SideNavItem } from '@astryxdesign/core/SideNav'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Timestamp } from '@astryxdesign/core/Timestamp'
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import {
  apiConfigured,
  apiReachable,
  type ConnectionStatus,
  conflictedCount,
  connectionMode,
  connectionStatus,
  type DbStatusMode,
  erroredCount,
  lastApiCheck,
  lastApiError,
  lastConnectionAttempt,
  lastSuccessfulSync,
  lastSyncError,
  pendingCount,
  remoteConfigured,
} from '../../lib/db'
import { isDesktop } from '../../lib/platform'

type Translate = (key: string, params?: Record<string, string | number>) => string
type DotVariant = 'success' | 'warning' | 'error' | 'accent' | 'neutral'

export interface SyncStatusInput {
  status: ConnectionStatus
  mode: DbStatusMode
  pending: number
  errors: number
  conflicts: number
  apiConfigured: boolean
  apiReachable: boolean
  remoteConfigured: boolean
  lastCheckedAt: number
  lastApiCheckedAt: number
  lastSyncedAt: number
  lastError: string | null
  lastApiError: string | null
}

const STATUS_ICON = { online: Cloud, offline: CloudOff, syncing: RefreshCw, error: TriangleAlert } as const
const STATUS_DOT: Record<ConnectionStatus, DotVariant> = {
  online: 'success',
  offline: 'neutral',
  syncing: 'accent',
  error: 'error',
}

/** Pure description of the sync/connectivity state for the sidebar item and startup screens. */
export function getSyncStatusViewModel(input: SyncStatusInput, t: Translate) {
  const statusLabel = t(`sync.status.${input.status}`)

  let label = statusLabel
  if (input.status === 'offline' && input.errors > 0) label = t('sync.offlineFailed', { count: input.errors })
  else if (input.status === 'offline' && input.pending > 0) label = t('sync.offlineQueued', { count: input.pending })
  else if (input.conflicts > 0) label = t('sync.withConflicts', { status: statusLabel, count: input.conflicts })

  let dotVariant = STATUS_DOT[input.status]
  if (input.status !== 'error' && (input.errors > 0 || input.conflicts > 0)) dotVariant = 'warning'

  const apiStatus = !input.apiConfigured
    ? t('sync.api.notConfigured')
    : input.apiReachable
      ? t('sync.api.reachable')
      : t('sync.api.unavailable')

  return {
    status: input.status,
    statusLabel,
    label,
    description: t(`sync.description.${input.status}`),
    icon: STATUS_ICON[input.status],
    dotVariant,
    isPulsing: input.status === 'syncing',
    title: input.mode === 'api' ? t('sync.apiTitle') : t('sync.mirrorTitle'),
    modeLabel: input.mode === 'api' ? t('sync.mode.api') : t('sync.mode.mirror'),
    apiStatus,
    remoteLabel: input.remoteConfigured ? t('common.yes') : t('common.no'),
    pendingLabel: input.pending > 0 ? t('sync.queued', { count: input.pending }) : t('sync.none'),
    errorsLabel: input.errors > 0 ? t('sync.retrying', { count: input.errors }) : t('sync.none'),
    conflictsLabel: input.conflicts > 0 ? t('sync.needReview', { count: input.conflicts }) : t('sync.none'),
    lastCheckedAt: input.lastCheckedAt > 0 ? input.lastCheckedAt : null,
    lastApiCheckedAt: input.lastApiCheckedAt > 0 ? input.lastApiCheckedAt : null,
    lastSyncedAt: input.lastSyncedAt > 0 ? input.lastSyncedAt : null,
    lastError: input.lastError,
    apiError: input.lastApiError && input.lastApiError !== input.lastError ? input.lastApiError : null,
  }
}

export type SyncStatusViewModel = ReturnType<typeof getSyncStatusViewModel>

/** Reads the connectivity signals into a view model. */
export function useSyncStatus(): SyncStatusViewModel {
  const { t } = useTranslation()
  return getSyncStatusViewModel(
    {
      status: connectionStatus.value,
      mode: connectionMode.value,
      pending: pendingCount.value,
      errors: erroredCount.value,
      conflicts: conflictedCount.value,
      apiConfigured: apiConfigured.value,
      apiReachable: apiReachable.value,
      remoteConfigured: remoteConfigured.value,
      lastCheckedAt: lastConnectionAttempt.value,
      lastApiCheckedAt: lastApiCheck.value,
      lastSyncedAt: lastSuccessfulSync.value,
      lastError: lastSyncError.value,
      lastApiError: lastApiError.value,
    },
    t,
  )
}

function relative(ms: number) {
  return <Timestamp value={new Date(ms).toISOString()} format="relative_short" hasTooltip={false} isLive />
}

/**
 * Sidebar footer row with the desktop sync status. Details (last sync,
 * queued/failed/conflicted writes, last errors) open from its menu.
 */
export function SyncStatusItem() {
  const { t } = useTranslation()
  const vm = useSyncStatus()

  if (!isDesktop) return null

  const details: DropdownMenuItemData[] = [
    { id: 'status', label: t('sync.statusLabel'), endContent: vm.statusLabel },
    { id: 'mode', label: t('sync.modeLabel'), endContent: vm.modeLabel },
    { id: 'api', label: t('sync.apiLabel'), endContent: vm.apiStatus },
    { id: 'remote', label: t('sync.remoteLabel'), endContent: vm.remoteLabel },
  ]
  if (vm.lastCheckedAt)
    details.push({ id: 'checked', label: t('sync.lastCheck'), endContent: relative(vm.lastCheckedAt) })
  if (vm.lastApiCheckedAt) {
    details.push({ id: 'api-checked', label: t('sync.apiCheck'), endContent: relative(vm.lastApiCheckedAt) })
  }
  if (vm.lastSyncedAt) details.push({ id: 'synced', label: t('sync.lastSync'), endContent: relative(vm.lastSyncedAt) })

  const writes: DropdownMenuItemData[] = [
    { id: 'pending', label: t('sync.pendingWrites'), endContent: vm.pendingLabel },
    { id: 'errors', label: t('sync.writeErrors'), endContent: vm.errorsLabel },
    { id: 'conflicts', label: t('sync.conflicts'), endContent: vm.conflictsLabel },
  ]
  if (vm.lastError) writes.push({ id: 'last-error', label: t('sync.lastError'), description: vm.lastError })
  if (vm.apiError) writes.push({ id: 'api-error', label: t('sync.apiError'), description: vm.apiError })

  return (
    <SideNavItem
      label={vm.label}
      icon={vm.icon}
      endContent={<StatusDot variant={vm.dotVariant} label={vm.statusLabel} isPulsing={vm.isPulsing} />}
      actions={
        <MoreMenu
          size="sm"
          label={t('sync.details')}
          placement="above"
          items={[
            { type: 'section', id: 'connection', title: vm.title, items: details },
            { type: 'divider' },
            { type: 'section', id: 'writes', title: t('sync.writesTitle'), items: writes },
          ]}
        />
      }
    />
  )
}
