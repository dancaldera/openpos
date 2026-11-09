import { Card } from '@astryxdesign/core/Card'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { ReactNode } from 'react'

interface InsightSectionProps {
  title: string
  /** Short context under the title, e.g. the period the figures cover. */
  description?: string
  /** End-aligned link or button, e.g. "View all". */
  action?: ReactNode
  children: ReactNode
}

/** Titled block on the dashboard and analytics pages: a level-2 heading over its content. */
export function InsightSection({ title, description, action, children }: InsightSectionProps) {
  return (
    <VStack gap={3}>
      <HStack gap={3} vAlign="end" wrap="wrap">
        <StackItem size="fill">
          <VStack gap={0.5}>
            <Heading level={2}>{title}</Heading>
            {description && <Text type="supporting">{description}</Text>}
          </VStack>
        </StackItem>
        {action}
      </HStack>
      {children}
    </VStack>
  )
}

interface LinkedStatProps {
  label: string
  value: ReactNode
  detail?: ReactNode
  href: string
}

/** Headline figure that opens the related list, styled like the shared StatTile. */
export function LinkedStat({ label, value, detail, href }: LinkedStatProps) {
  return (
    <ClickableCard label={label} href={href} height="100%">
      <VStack gap={1}>
        <Text type="supporting">{label}</Text>
        <Text type="large" weight="semibold" hasTabularNumbers>
          {value}
        </Text>
        {detail && <Text type="supporting">{detail}</Text>}
      </VStack>
    </ClickableCard>
  )
}

/** Placeholder row of stat tiles while figures load. */
export function StatGridSkeleton({ count, minWidth = 180 }: { count: number; minWidth?: number }) {
  return (
    <Grid columns={{ minWidth }} gap={4}>
      {Array.from({ length: count }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <Card key={index}>
          <VStack gap={2}>
            <Skeleton width="50%" height={14} index={index} />
            <Skeleton width="70%" height={24} index={index} />
            <Skeleton width="60%" height={12} index={index} />
          </VStack>
        </Card>
      ))}
    </Grid>
  )
}

/** Placeholder for a table or list card while its rows load. */
export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card>
      <VStack gap={4}>
        {Array.from({ length: rows }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          <HStack key={index} gap={3} vAlign="center">
            <Skeleton width={32} height={32} radius="rounded" index={index} />
            <StackItem size="fill">
              <VStack gap={1.5}>
                <Skeleton width="55%" height={14} index={index} />
                <Skeleton width="35%" height={12} index={index} />
              </VStack>
            </StackItem>
            <Skeleton width={72} height={14} index={index} />
          </HStack>
        ))}
      </VStack>
    </Card>
  )
}

/** `YYYY-MM-DD` for a local date, the format date inputs use. */
export function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Local midnight for a `YYYY-MM-DD` string; today for anything unparsable. */
export function fromISODate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return new Date()
  return new Date(year, month - 1, day)
}
