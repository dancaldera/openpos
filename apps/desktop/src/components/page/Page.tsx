import { BreadcrumbItem, Breadcrumbs } from '@astryxdesign/core/Breadcrumbs'
import { Heading } from '@astryxdesign/core/Heading'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { ReactNode } from 'react'
import { hrefFor } from '../../lib/router'

export interface PageCrumb {
  label: string
  /** Route path (e.g. `orders`). Omit for the current page. */
  to?: string
}

interface PageHeaderProps {
  title: string
  description?: string
  breadcrumbs?: PageCrumb[]
  /** Primary and secondary page actions, aligned to the end of the title row. */
  actions?: ReactNode
  /** Small facts next to the title, e.g. a status. */
  meta?: ReactNode
}

export function PageHeader({ title, description, breadcrumbs, actions, meta }: PageHeaderProps) {
  return (
    <VStack gap={3}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs variant="supporting">
          {breadcrumbs.map((crumb) => (
            <BreadcrumbItem
              key={`${crumb.label}-${crumb.to ?? 'current'}`}
              href={crumb.to ? hrefFor(crumb.to) : undefined}
            >
              {crumb.label}
            </BreadcrumbItem>
          ))}
        </Breadcrumbs>
      )}
      <HStack gap={4} vAlign="center" wrap="wrap">
        <StackItem size="fill">
          <VStack gap={1}>
            <HStack gap={3} vAlign="center" wrap="wrap">
              <Heading level={1}>{title}</Heading>
              {meta}
            </HStack>
            {description && <Text type="supporting">{description}</Text>}
          </VStack>
        </StackItem>
        {actions && (
          <HStack gap={2} vAlign="center" wrap="wrap">
            {actions}
          </HStack>
        )}
      </HStack>
    </VStack>
  )
}

interface PageProps extends PageHeaderProps {
  children: ReactNode
  /** Max content width in px: 1200 for tables and dashboards, 960 for detail pages, 720 for forms. */
  width?: number
}

/**
 * Standard page frame inside the app shell: a scrolling content column with the
 * page header (breadcrumbs, title, actions) at the top. Every screen uses it so
 * spacing and widths stay consistent.
 */
export function Page({ children, width = 1200, ...header }: PageProps) {
  return (
    <Layout
      height="fill"
      content={
        <LayoutContent padding={0}>
          <VStack
            className="mx-auto w-full"
            maxWidth={width + 48}
            paddingInline={6}
            paddingBlockStart={6}
            paddingBlockEnd={10}
            gap={6}
          >
            <PageHeader {...header} />
            {children}
          </VStack>
        </LayoutContent>
      }
    />
  )
}
