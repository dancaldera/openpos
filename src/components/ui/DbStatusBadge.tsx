import { useSignal } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'
import { connectionMode, connectionStatus, lastConnectionAttempt, pendingCount, remoteConfigured } from '../../lib/db'

const STATUS_CONFIG = {
  remote: {
    dot: 'bg-green-400',
    label: 'Remote',
    sublabel: 'Remote database',
    border: 'border-green-500/30',
    badgeBg: 'bg-gray-900/90',
    textColor: 'text-green-400',
  },
  local: {
    dot: 'bg-yellow-400',
    label: 'Local',
    sublabel: 'SQLite (offline mode)',
    border: 'border-yellow-500/30',
    badgeBg: 'bg-gray-900/90',
    textColor: 'text-yellow-400',
  },
  syncing: {
    dot: 'bg-blue-400',
    label: 'Syncing',
    sublabel: 'Connecting to Turso…',
    border: 'border-blue-500/30',
    badgeBg: 'bg-gray-900/90',
    textColor: 'text-blue-400',
  },
  error: {
    dot: 'bg-red-500',
    label: 'Error',
    sublabel: 'No database connection',
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
  const isRemoteConfigured = remoteConfigured.value
  const lastCheckedAt =
    lastConnectionAttempt.value > 0 ? new Date(lastConnectionAttempt.value).toISOString() : undefined

  const modeDescription =
    connectionMode.value === 'api'
      ? 'Via API server'
      : connectionMode.value === 'sqlite'
        ? 'SQLite (offline mode)'
        : 'Direct remote sync'

  /** Badge text: shows pending count when local and queue is non-empty */
  const badgeLabel = status === 'local' && pending > 0 ? `Local · ${pending} pending` : config.label

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        popoverOpen.value = false
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Relative time ticker — re-renders every 5s while popover is open
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
      {/* Popover */}
      {popoverOpen.value && (
        <div
          class={`mb-1 w-64 rounded-lg border ${config.border} bg-gray-900/95 backdrop-blur-sm shadow-xl text-xs text-gray-300 overflow-hidden`}
        >
          <div class="px-4 py-3 border-b border-white/10">
            <p class="font-semibold text-white text-sm">Database Connection</p>
            <p class="text-gray-400 mt-0.5">Current storage mode</p>
          </div>

          <div class="px-4 py-3 space-y-2.5">
            {/* Status row */}
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

            {/* Mode description */}
            <div class="flex items-center justify-between">
              <span class="text-gray-400">Mode</span>
              <span class="text-gray-200">{modeDescription}</span>
            </div>

            {/* Turso configured */}
            <div class="flex items-center justify-between">
              <span class="text-gray-400">Remote DB configured</span>
              <span class={isRemoteConfigured ? 'text-green-400' : 'text-gray-500'}>
                {isRemoteConfigured ? 'Yes' : 'No'}
              </span>
            </div>

            {/* Last check */}
            {lastCheckedAt && (
              <div class="flex items-center justify-between">
                <span class="text-gray-400">Last check</span>
                <span class="text-gray-200">
                  {/* tick.value accessed to trigger re-render */}
                  {tick.value >= 0 && formatRelativeTime(lastCheckedAt)}
                </span>
              </div>
            )}

            {/* Pending writes (Tauri only) */}
            <div class="flex items-center justify-between">
              <span class="text-gray-400">Pending writes</span>
              <span class={pending > 0 ? 'text-yellow-400 font-medium' : 'text-gray-500'}>
                {pending > 0 ? `${pending} queued` : 'None'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Badge pill */}
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
          <span class={`w-2 h-2 rounded-full ${config.dot} ${status === 'remote' ? 'animate-pulse' : ''}`} />
        )}
        <span class={`text-xs font-medium ${config.textColor}`}>{badgeLabel}</span>
      </button>
    </div>
  )
}
