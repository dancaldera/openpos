import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { ReactNode } from 'react'

interface SettingsGroupProps {
  title: string
  description?: string
  children: ReactNode
}

/**
 * One block of the settings page: the title and explanation sit in a narrow
 * column on the left and the controls in a card on the right (stacked on
 * narrow screens).
 */
export function SettingsGroup({ title, description, children }: SettingsGroupProps) {
  return (
    <section className="grid items-start gap-4 md:grid-cols-[260px_minmax(0,1fr)] md:gap-8">
      <VStack gap={1}>
        <Heading level={2}>{title}</Heading>
        {description && (
          <Text as="p" type="supporting">
            {description}
          </Text>
        )}
      </VStack>
      <Card>
        <VStack gap={4}>{children}</VStack>
      </Card>
    </section>
  )
}
