import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'

export interface TrendBucket {
  /** `YYYY-MM-DD` */
  day: string
  revenue: number
  orders: number
}

interface SalesTrendChartProps {
  buckets: TrendBucket[]
  /** Accessible summary of the whole chart. */
  label: string
  formatDay: (day: string) => string
  formatValue: (value: number) => string
  /** Tooltip text for one bar. */
  describeBucket: (bucket: TrendBucket) => string
}

const CHART_HEIGHT = 160

/**
 * Daily revenue as a simple column chart. Bars use the theme accent color on a
 * muted track so the chart follows light and dark themes without a chart library.
 */
export function SalesTrendChart({ buckets, label, formatDay, formatValue, describeBucket }: SalesTrendChartProps) {
  const max = buckets.reduce((highest, bucket) => Math.max(highest, bucket.revenue), 0)
  const first = buckets[0]
  const last = buckets[buckets.length - 1]

  return (
    <VStack gap={2}>
      <Text type="supporting" hasTabularNumbers>
        {formatValue(max)}
      </Text>
      <div
        role="img"
        aria-label={label}
        className="flex items-end gap-px border-b"
        style={{ height: CHART_HEIGHT, borderColor: 'var(--color-border)' }}
      >
        {buckets.map((bucket) => {
          const share = max > 0 ? bucket.revenue / max : 0
          return (
            <Tooltip key={bucket.day} content={describeBucket(bucket)} hasHoverIndication={false}>
              <div className="flex h-full min-w-0 flex-1 items-end" data-testid="trend-bar">
                <div
                  className="w-full rounded-t-sm transition-opacity hover:opacity-80"
                  style={{
                    height: bucket.revenue > 0 ? `${Math.max(share * 100, 2)}%` : 2,
                    background: bucket.revenue > 0 ? 'var(--color-accent)' : 'var(--color-border)',
                  }}
                />
              </div>
            </Tooltip>
          )
        })}
      </div>
      {first && last && (
        <HStack hAlign="between" vAlign="center">
          <Text type="supporting">{formatDay(first.day)}</Text>
          {last.day !== first.day && <Text type="supporting">{formatDay(last.day)}</Text>}
        </HStack>
      )}
    </VStack>
  )
}
