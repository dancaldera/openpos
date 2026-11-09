import { Card } from '@astryxdesign/core/Card'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { ReactNode } from 'react'

interface StatTileProps {
  label: string
  value: ReactNode
  /** Secondary line under the value, e.g. a comparison. */
  detail?: ReactNode
}

/** Headline figure for summary rows on list and dashboard pages. */
export function StatTile({ label, value, detail }: StatTileProps) {
  return (
    <Card>
      <VStack gap={1}>
        <Text type="supporting">{label}</Text>
        <Text type="large" weight="semibold" hasTabularNumbers>
          {value}
        </Text>
        {detail && <Text type="supporting">{detail}</Text>}
      </VStack>
    </Card>
  )
}
