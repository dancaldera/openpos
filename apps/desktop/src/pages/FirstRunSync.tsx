import { DbStatusBadge } from '../components/ui/DbStatusBadge'
import { SpinnerIcon } from '../components/ui/icons'
import { useTranslation } from '../hooks/useTranslation'
import { APP_VERSION } from '../lib/app-version'
import type { DesktopFirstRunStatus } from '../lib/desktop'
import { appSettingsStore } from '../stores/appSettings/appSettingsStore'

interface FirstRunSyncProps {
  status: DesktopFirstRunStatus
  isRetrying: boolean
  onRetry: () => Promise<void>
}

export default function FirstRunSync({ status, isRetrying, onRetry }: FirstRunSyncProps) {
  const { t } = useTranslation()
  const { appName } = appSettingsStore

  const isMissingConfig = status.status === 'needsRemoteConfig'
  const isSyncing = status.status === 'syncingInitialData'
  const isFailed = status.status === 'initialSyncFailed'

  const title = isMissingConfig
    ? t('startup.needsRemoteConfigTitle')
    : isSyncing
      ? t('startup.syncingTitle')
      : t('startup.initialSyncFailedTitle')

  const description = isMissingConfig
    ? t('startup.needsRemoteConfigDescription')
    : isSyncing
      ? t('startup.syncingDescription')
      : t('startup.initialSyncFailedDescription')

  return (
    <div class="min-h-screen flex items-center justify-center p-4 bg-chalk">
      <div class="w-full max-w-md">
        <div class="bg-canvas backdrop-blur-sm rounded-cards shadow-sm p-8">
          <div class="text-center mb-8">
            <h1 class="text-2xl font-bold text-void">{appName.value}</h1>
            <p class="text-sm text-graphite mt-2">{t('startup.subtitle')}</p>
          </div>

          <div class="rounded-cards border border-fog-border bg-chalk px-4 py-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="flex h-10 w-10 items-center justify-center rounded-buttons bg-void text-canvas">
                {isSyncing ? (
                  <SpinnerIcon class="h-5 w-5 animate-spin" />
                ) : (
                  <span class="text-lg font-semibold">{isMissingConfig ? '!' : 'x'}</span>
                )}
              </div>
              <div class="text-left">
                <h2 class="text-lg font-semibold text-void">{title}</h2>
                <p class="text-sm text-graphite">{description}</p>
              </div>
            </div>

            {status.lastError ? <p class="text-sm text-void mb-4">{status.lastError}</p> : null}

            <div class="space-y-2 text-sm text-void">
              <p>
                {t('startup.remoteConfigured', { value: status.remoteConfigured ? t('common.yes') : t('common.no') })}
              </p>
              <p>{t('startup.activeUsers', { count: status.activeUserCount })}</p>
            </div>
          </div>

          <div class="mt-6 space-y-3">
            {isMissingConfig ? <p class="text-sm text-graphite">{t('startup.configureRemoteHint')}</p> : null}

            {isFailed ? (
              <button
                type="button"
                onClick={() => void onRetry()}
                disabled={isRetrying}
                class="w-full py-3 px-4 bg-void text-canvas font-semibold rounded-buttons transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRetrying ? t('common.loading') : t('startup.retry')}
              </button>
            ) : null}
          </div>

          <div class="mt-8 pt-6 border-t border-fog-border text-center">
            <span class="text-xs text-graphite">
              v{APP_VERSION} • {t('startup.firstRunRequired')}
            </span>
          </div>
        </div>
      </div>

      <DbStatusBadge />
    </div>
  )
}
