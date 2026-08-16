interface MetricCardProps {
  label: string
  value: string | number
  description?: string
  class?: string
}

export function MetricCard({ label, value, description, class: className = '' }: MetricCardProps) {
  return (
    <div
      class={`rounded-cards border border-fog-border bg-canvas p-3 transition-colors hover:border-fog-border hover:shadow-sm sm:p-5 ${className}`}
    >
      <p class="mb-1 text-xs font-medium uppercase tracking-wide text-void">{label}</p>
      <p class="text-xl font-semibold text-void sm:text-2xl">{value}</p>
      {description && <p class="mt-1 text-xs text-graphite">{description}</p>}
    </div>
  )
}
