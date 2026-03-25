import { signal, useSignal } from '@preact/signals'
import { useRef } from 'preact/hooks'
import { useClickOutside } from '../../hooks/useClickOutside'
import { getDesktopApi } from '../../lib/desktop'
import { isDesktop } from '../../lib/platform'
import { updateActions } from '../../stores/update/updateActions'
import {
  downloadError,
  isChecking,
  lastCheckTime,
  updateAvailable,
  updateReleaseNotes,
  updateReleaseUrl,
  updateVersion,
} from '../../stores/update/updateStore'
import { SpinnerIcon } from './icons'

const currentAppVersion = signal<string | null>(null)
if (isDesktop) {
  getDesktopApi()
    ?.getInfo()
    .then(({ version }) => {
      currentAppVersion.value = version
    })
    .catch(() => {})
}

function RocketIcon({ class: className }: { class?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="1.5"
      stroke="currentColor"
      class={className}
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"
      />
    </svg>
  )
}

export function UpdateBadge() {
  if (!isDesktop) return null

  const popoverOpen = useSignal(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const installedVersion = currentAppVersion.value
  useClickOutside(wrapperRef, () => {
    popoverOpen.value = false
  })

  const checking = isChecking.value
  const available = updateAvailable.value
  const latestVersion = updateVersion.value
  const releaseUrl = updateReleaseUrl.value
  const releaseNotes = updateReleaseNotes.value
  const error = downloadError.value
  const checkedAt = lastCheckTime.value

  const borderClass = available ? 'border-amber-500/40' : 'border-gray-700/50'
  const iconColorClass = available ? 'text-amber-400' : 'text-gray-400'

  async function handleViewRelease() {
    const url = releaseUrl ?? 'https://github.com/dancaldera/OpenPOS/releases/latest'
    await getDesktopApi()?.updates.openReleasePage(url)
  }

  return (
    <div ref={wrapperRef} class="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2">
      {popoverOpen.value && (
        <div
          class={`mb-1 w-64 rounded-lg border ${borderClass} bg-gray-900/95 backdrop-blur-sm shadow-xl text-xs text-gray-300 overflow-hidden`}
        >
          <div class="px-4 py-3 border-b border-white/10">
            <p class="font-semibold text-white text-sm">App Update</p>
            <p class="text-gray-400 mt-0.5">{available ? 'New version available' : 'Check for a newer release'}</p>
          </div>

          <div class="px-4 py-3 space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-gray-400">Installed</span>
              <span class="text-gray-200">{installedVersion ?? '…'}</span>
            </div>

            {latestVersion && (
              <div class="flex items-center justify-between">
                <span class="text-gray-400">Latest</span>
                <span class={available ? 'text-amber-400 font-medium' : 'text-gray-200'}>{latestVersion}</span>
              </div>
            )}

            {checkedAt > 0 && (
              <div class="flex items-center justify-between">
                <span class="text-gray-400">Last checked</span>
                <span class="text-gray-200">{new Date(checkedAt).toLocaleTimeString()}</span>
              </div>
            )}

            {releaseNotes && (
              <div class="space-y-1 pt-0.5">
                <span class="text-gray-400">Release notes</span>
                <p class="text-gray-300 leading-relaxed line-clamp-3">{releaseNotes.slice(0, 200)}</p>
              </div>
            )}

            {error && (
              <div class="space-y-1 pt-0.5">
                <span class="text-gray-400">Error</span>
                <p class="text-rose-300 leading-relaxed">{error}</p>
              </div>
            )}
          </div>

          <div class="px-4 pb-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                void updateActions.checkForUpdate()
              }}
              disabled={checking}
              class="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors disabled:opacity-50"
            >
              {checking && <SpinnerIcon class="w-3 h-3 animate-spin" />}
              {checking ? 'Checking…' : 'Check for updates'}
            </button>

            {available && (
              <button
                type="button"
                onClick={handleViewRelease}
                class="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium transition-colors"
              >
                View Release ↗
              </button>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          popoverOpen.value = !popoverOpen.value
        }}
        class={`relative flex items-center gap-2 px-3 py-1.5 rounded-full border ${borderClass} bg-gray-900/90 backdrop-blur-sm shadow-lg cursor-pointer select-none transition-opacity hover:opacity-90 active:scale-95`}
        title="App updates"
      >
        {checking ? (
          <SpinnerIcon class={`w-3 h-3 animate-spin ${iconColorClass}`} />
        ) : (
          <span class="relative inline-flex">
            <RocketIcon class={`w-3 h-3 ${iconColorClass}`} />
            {available && <span class="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />}
          </span>
        )}
        <span class={`text-xs font-medium ${iconColorClass}`}>{available ? `v${latestVersion}` : 'Updates'}</span>
      </button>
    </div>
  )
}
