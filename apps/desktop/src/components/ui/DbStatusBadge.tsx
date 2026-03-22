import { useSignal } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'
import {
  apiConfigured,
  apiReachable,
  conflictedCount,
  connectionMode,
  connectionStatus,
  erroredCount,
  lastApiCheck,
  lastApiError,
  lastConnectionAttempt,
  lastSuccessfulSync,
  lastSyncError,
  pendingCount,
  remoteConfigured,
} from '../../lib/db'

const STATUS_CONFIG = {
  online: {
    dot: 'bg-green-400',
    label: 'Online',
    sublabel: 'Remote sync healthy',
    border: 'border-green-500/30',
    badgeBg: 'bg-gray-900/90',
    textColor: 'text-green-400',
  },
  offline: {
    dot: 'bg-yellow-400',
    label: 'Offline',
    sublabel: 'Using local SQLite mirror',
    border: 'border-yellow-500/30',
    badgeBg: 'bg-gray-900/90',
    textColor: 'text-yellow-400',
  },
  syncing: {
    dot: 'bg-blue-400',
    label: 'Syncing',
    sublabel: 'Reconciling local mirror',
    border: 'border-blue-500/30',
    badgeBg: 'bg-gray-900/90',
    textColor: 'text-blue-400',
  },
  error: {
    dot: 'bg-red-500',
    label: 'Error',
    sublabel: 'Sync subsystem unavailable',
    border: 'border-red-500/30',
    badgeBg: 'bg-gray-900/90',
    textColor: 'text-red-400',
  },
} as const

function formatRelativeTime(timestamp?: string): string {
  if (!timestamp) return 'not yet'

  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) return 'not yet'

  const diff = Math.floor((Date.now() - parsed) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export function DbStatusBadge() {
  const popoverOpen = useSignal(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const status = connectionStatus.value
  const config = STATUS_CONFIG[status]
  const pending = pendingCount.value
  const errors = erroredCount.value
  const conflicts = conflictedCount.value
  const isRemoteConfigured = remoteConfigured.value
  const isApiConfigured = apiConfigured.value
  const isApiReachable = apiReachable.value
  const lastCheckedAt =
    lastConnectionAttempt.value > 0 ? new Date(lastConnectionAttempt.value).toISOString() : undefined
  const lastSyncedAt = lastSuccessfulSync.value > 0 ? new Date(lastSuccessfulSync.value).toISOString() : undefined
  const lastApiCheckedAt = lastApiCheck.value > 0 ? new Date(lastApiCheck.value).toISOString() : undefined
  const lastError = lastSyncError.value
  const lastApiFailure = lastApiError.value

  const modeDescription = connectionMode.value === 'api' ? 'API server' : 'Local SQLite mirror'
  const panelTitle = connectionMode.value === 'api' ? 'API Connection' : 'Data Connectivity'
  const panelSubtitle =
    connectionMode.value === 'api' ? 'Web client API status' : 'Desktop local-first sync and API health'
  const apiStatusLabel = !isApiConfigured ? 'Not configured' : isApiReachable ? 'Reachable' : 'Unavailable'
  const apiStatusClass = !isApiConfigured
    ? 'text-gray-500'
    : isApiReachable
      ? 'text-green-400'
      : 'text-rose-400 font-medium'

  const badgeLabel =
    status === 'offline' && errors > 0
      ? `Offline · ${errors} failed`
      : status === 'offline' && pending > 0
        ? `Offline · ${pending} queued`
        : conflicts > 0
          ? `${config.label} · ${conflicts} conflicts`
          : config.label

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        popoverOpen.value = false
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const tick = useSignal(0)
  useEffect(() => {
    if (!popoverOpen.value) return

    const id = setInterval(() => {
      tick.value += 1
    }, 5000)

    return () => clearInterval(id)
  }, [popoverOpen.value])

  return (
    <div ref={wrapperRef} class="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {popoverOpen.value && (
        <div
          class={`mb-1 w-64 rounded-lg border ${config.border} bg-gray-900/95 backdrop-blur-sm shadow-xl text-xs text-gray-300 overflow-hidden`}
        >
          <div class="px-4 py-3 border-b border-white/10">
            <p class="font-semibold text-white text-sm">{panelTitle}</p>
            <p class="text-gray-400 mt-0.5">{panelSubtitle}</p>
          </div>

          <div class="px-4 py-3 space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-gray-400">Status</span>
              <span class={`font-medium ${config.textColor} flex items-center gap-1.5`}>
                {status === 'syncing' ? (
                  <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" role="img" aria-hidden="true">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <span class={`inline-block w-2 h-2 rounded-full ${config.dot}`} />
                )}
                {config.label}
              </span>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-gray-400">Mode</span>
              <span class="text-gray-200">{modeDescription}</span>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-gray-400">API</span>
              <span class={apiStatusClass}>{apiStatusLabel}</span>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-gray-400">Remote configured</span>
              <span class={isRemoteConfigured ? 'text-green-400' : 'text-gray-500'}>
                {isRemoteConfigured ? 'Yes' : 'No'}
              </span>
            </div>

            {lastCheckedAt && (
              <div class="flex items-center justify-between">
                <span class="text-gray-400">Last check</span>
                <span class="text-gray-200">{tick.value >= 0 && formatRelativeTime(lastCheckedAt)}</span>
              </div>
            )}

            {lastApiCheckedAt && (
              <div class="flex items-center justify-between">
                <span class="text-gray-400">API check</span>
                <span class="text-gray-200">{tick.value >= 0 && formatRelativeTime(lastApiCheckedAt)}</span>
              </div>
            )}

            {lastSyncedAt && (
              <div class="flex items-center justify-between">
                <span class="text-gray-400">Last sync</span>
                <span class="text-gray-200">{tick.value >= 0 && formatRelativeTime(lastSyncedAt)}</span>
              </div>
            )}

            <div class="flex items-center justify-between">
              <span class="text-gray-400">Pending writes</span>
              <span class={pending > 0 ? 'text-yellow-400 font-medium' : 'text-gray-500'}>
                {pending > 0 ? `${pending} queued` : 'None'}
              </span>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-gray-400">Write errors</span>
              <span class={errors > 0 ? 'text-rose-400 font-medium' : 'text-gray-500'}>
                {errors > 0 ? `${errors} retrying` : 'None'}
              </span>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-gray-400">Conflicts</span>
              <span class={conflicts > 0 ? 'text-rose-400 font-medium' : 'text-gray-500'}>
                {conflicts > 0 ? `${conflicts} need review` : 'None'}
              </span>
            </div>

            {lastError && (
              <div class="space-y-1">
                <span class="text-gray-400">Last error</span>
                <p class="text-rose-300 leading-relaxed">{lastError}</p>
              </div>
            )}

            {lastApiFailure && lastApiFailure !== lastError && (
              <div class="space-y-1">
                <span class="text-gray-400">API error</span>
                <p class="text-rose-300 leading-relaxed">{lastApiFailure}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          popoverOpen.value = !popoverOpen.value
        }}
        class={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${config.border} ${config.badgeBg} backdrop-blur-sm shadow-lg cursor-pointer select-none transition-opacity hover:opacity-90 active:scale-95`}
        title={config.sublabel}
      >
        {status === 'syncing' ? (
          <svg
            class={`w-2.5 h-2.5 animate-spin ${config.textColor}`}
            fill="none"
            viewBox="0 0 24 24"
            role="img"
            aria-hidden="true"
          >
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <span class={`w-2 h-2 rounded-full ${config.dot} ${status === 'online' ? 'animate-pulse' : ''}`} />
        )}
        <span class={`text-xs font-medium ${config.textColor}`}>{badgeLabel}</span>
      </button>
    </div>
  )
}
