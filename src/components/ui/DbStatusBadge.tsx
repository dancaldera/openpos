import { useSignal } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'
import { connectionStatus, lastConnectionAttempt } from '../../lib/db'
import { startHealthCheck, stopHealthCheck } from '../../lib/db-adapter'

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

function formatRelativeTime(timestamp: number): string {
  if (timestamp === 0) return 'not yet'
  const diff = Math.floor((Date.now() - timestamp) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname
    // Show first segment and last 6 chars: "openpos-demo-…cdera"
    if (host.length > 20) {
      return `${host.slice(0, 14)}…${host.slice(-6)}`
    }
    return host
  } catch {
    return `${url.slice(0, 20)}…`
  }
}

export function DbStatusBadge() {
  const popoverOpen = useSignal(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const status = connectionStatus.value
  const config = STATUS_CONFIG[status]

  const tursoUrl = import.meta.env.VITE_TURSO_DATABASE_URL as string | undefined
  const tursoConfigured = Boolean(tursoUrl && import.meta.env.VITE_TURSO_AUTH_TOKEN)

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

  // Start background health-check on mount; stop on unmount
  useEffect(() => {
    startHealthCheck(15_000)
    return () => stopHealthCheck()
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
              <span class="text-gray-200">{config.sublabel}</span>
            </div>

            {/* Turso configured */}
            <div class="flex items-center justify-between">
              <span class="text-gray-400">Remote DB configured</span>
              <span class={tursoConfigured ? 'text-green-400' : 'text-gray-500'}>{tursoConfigured ? 'Yes' : 'No'}</span>
            </div>

            {/* URL (only when configured) */}
            {tursoConfigured && tursoUrl && (
              <div class="flex items-center justify-between">
                <span class="text-gray-400">URL</span>
                <span class="text-gray-200 font-mono" title={tursoUrl}>
                  {maskUrl(tursoUrl)}
                </span>
              </div>
            )}

            {/* Last check */}
            <div class="flex items-center justify-between">
              <span class="text-gray-400">Last check</span>
              <span class="text-gray-200">
                {/* tick.value accessed to trigger re-render */}
                {tick.value >= 0 && formatRelativeTime(lastConnectionAttempt.value)}
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
        <span class={`text-xs font-medium ${config.textColor}`}>{config.label}</span>
      </button>
    </div>
  )
}
