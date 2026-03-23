import { DbStatusBadge } from '../components/ui/DbStatusBadge'
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
    <div class="min-h-screen flex items-center justify-center p-4 bg-blue-100">
      <div class="w-full max-w-md">
        <div class="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl p-8">
          <div class="text-center mb-8">
            <h1 class="text-2xl font-bold text-gray-900">{appName.value}</h1>
            <p class="text-sm text-gray-600 mt-2">{t('startup.subtitle')}</p>
          </div>

          <div class="rounded-xl border border-blue-200 bg-blue-50 px-4 py-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white">
                {isSyncing ? (
                  <svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" role="img">
                    <title>{t('startup.syncingTitle')}</title>
                    <circle
                      class="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="4"
                      fill="none"
                    />
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <span class="text-lg font-semibold">{isMissingConfig ? '!' : 'x'}</span>
                )}
              </div>
              <div class="text-left">
                <h2 class="text-lg font-semibold text-gray-900">{title}</h2>
                <p class="text-sm text-gray-600">{description}</p>
              </div>
            </div>

            {status.lastError ? <p class="text-sm text-red-700 mb-4">{status.lastError}</p> : null}

            <div class="space-y-2 text-sm text-gray-700">
              <p>
                {t('startup.remoteConfigured', { value: status.remoteConfigured ? t('common.yes') : t('common.no') })}
              </p>
              <p>{t('startup.activeUsers', { count: status.activeUserCount })}</p>
            </div>
          </div>

          <div class="mt-6 space-y-3">
            {isMissingConfig ? <p class="text-sm text-gray-600">{t('startup.configureRemoteHint')}</p> : null}

            {isFailed ? (
              <button
                type="button"
                onClick={() => void onRetry()}
                disabled={isRetrying}
                class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRetrying ? t('common.loading') : t('startup.retry')}
              </button>
            ) : null}
          </div>

          <div class="mt-8 pt-6 border-t border-gray-200 text-center">
            <span class="text-xs text-gray-500">
              v{APP_VERSION} • {t('startup.firstRunRequired')}
            </span>
          </div>
        </div>
      </div>

      <DbStatusBadge />
    </div>
  )
}
