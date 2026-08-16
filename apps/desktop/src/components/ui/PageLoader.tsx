import { SpinnerIcon } from './icons'

interface PageLoaderProps {
  message?: string
}

export function PageLoader({ message }: PageLoaderProps) {
  return (
    <div class="flex flex-col items-center justify-center py-24">
      <SpinnerIcon class="h-7 w-7 animate-spin text-graphite" />
      {message && <p class="mt-4 text-sm text-graphite">{message}</p>}
    </div>
  )
}

export function FullPageLoader({ message }: PageLoaderProps) {
  return (
    <div class="min-h-screen bg-canvas flex items-center justify-center">
      <div class="flex flex-col items-center">
        <SpinnerIcon class="h-7 w-7 animate-spin text-graphite" />
        {message && <p class="mt-4 text-sm text-graphite">{message}</p>}
      </div>
    </div>
  )
}

function SkeletonBlock({ class: className }: { class?: string }) {
  return <div class={`animate-pulse rounded-cards bg-chalk ${className ?? ''}`} />
}

export function DashboardSkeleton() {
  return (
    <div class="max-w-5xl mx-auto">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {[1, 2, 3].map((i) => (
          <div key={i} class="rounded-cards border border-fog-border bg-canvas p-5">
            <SkeletonBlock class="h-3 w-24 mb-3" />
            <SkeletonBlock class="h-7 w-28" />
          </div>
        ))}
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} class="rounded-cards border border-fog-border bg-canvas p-5">
            <SkeletonBlock class="h-3 w-28 mb-3" />
            <SkeletonBlock class="h-7 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
