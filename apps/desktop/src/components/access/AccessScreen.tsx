import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { Fragment, type ReactNode } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { isDesktop } from '../../lib/platform'
import { appSettingsStore } from '../../stores/appSettings/appSettingsStore'
import { useSyncStatus } from '../shell/SyncStatusItem'
import { useUpdateStatus } from '../shell/UpdateStatusItem'

interface AccessScreenProps {
  title: string
  description?: ReactNode
  children: ReactNode
  /** Small links/info below the card, separated by dots. Falsy entries are skipped. */
  footer?: ReactNode[]
  /** Show the desktop sync status in the footer. */
  hasSyncStatus?: boolean
}

/**
 * Full-window, centered card used by every screen shown before the app shell
 * (sign-in, connection setup, first sync). Stays draggable on desktop.
 */
export function AccessScreen({ title, description, children, footer = [], hasSyncStatus = false }: AccessScreenProps) {
  const items = footer.filter(Boolean)
  return (
    <div className="drag-region relative isolate min-h-screen">
      <AccessBackdrop />
      <Center axis="both" padding={6} minHeight="100vh">
        <div className="no-drag relative z-[1] w-full max-w-[420px]">
          <VStack gap={6} hAlign="stretch">
            <AccessBrand />

            {isDesktop && <AccessUpdateNotice />}

            <Card padding={8} width="100%">
              <VStack gap={6} hAlign="stretch">
                <VStack gap={1} hAlign="center">
                  <Heading level={2} accessibilityLevel={1} justify="center">
                    {title}
                  </Heading>
                  {description ? (
                    <Text as="p" type="supporting" justify="center">
                      {description}
                    </Text>
                  ) : null}
                </VStack>
                {children}
              </VStack>
            </Card>

            {(items.length > 0 || (hasSyncStatus && isDesktop)) && (
              <HStack gap={2} hAlign="center" vAlign="center" wrap="wrap">
                {hasSyncStatus && isDesktop && <AccessSyncStatus />}
                {items.map((item, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: footer entries are static per render
                  <Fragment key={index}>
                    {(index > 0 || (hasSyncStatus && isDesktop)) && (
                      <Text type="supporting" aria-hidden="true">
                        ·
                      </Text>
                    )}
                    {item}
                  </Fragment>
                ))}
              </HStack>
            )}
          </VStack>
        </div>
      </Center>
    </div>
  )
}

/** App icon with the store name (from company settings), and the app name when it differs. */
function AccessBrand() {
  const appName = appSettingsStore.appName.value
  const storeName = appSettingsStore.companyName.value.trim()
  return (
    <VStack gap={2} hAlign="center">
      <img src="/icon.png" alt="" className="access-brand-icon h-12 w-12" />
      <VStack gap={0} hAlign="center">
        <Text weight="semibold" size="lg" justify="center">
          {storeName || appName}
        </Text>
        {storeName && storeName !== appName ? (
          <Text type="supporting" justify="center">
            {appName}
          </Text>
        ) : null}
      </VStack>
    </VStack>
  )
}

/**
 * Decorative background for the screens before the app shell: slow-moving
 * glows tinted by the store palette over a fading dot grid. Styles live in
 * App.css (`.access-backdrop`); motion stops with prefers-reduced-motion.
 */
function AccessBackdrop() {
  return (
    <div className="access-backdrop" aria-hidden="true" data-testid="access-backdrop">
      <div className="access-backdrop__glow access-backdrop__glow--primary" />
      <div className="access-backdrop__glow access-backdrop__glow--secondary" />
      <div className="access-backdrop__glow access-backdrop__glow--sheen" />
      <div className="access-backdrop__grid" />
    </div>
  )
}

function AccessSyncStatus() {
  const vm = useSyncStatus()
  return (
    <HStack gap={1.5} vAlign="center">
      <StatusDot variant={vm.dotVariant} label={vm.statusLabel} isPulsing={vm.isPulsing} tooltip={vm.description} />
      <Text type="supporting">{vm.label}</Text>
    </HStack>
  )
}

/** Desktop update prompt for screens shown before sign-in. Renders nothing without an update. */
export function AccessUpdateNotice() {
  const { t } = useTranslation()
  const { viewModel, runPrimaryAction, viewRelease } = useUpdateStatus()
  if (!viewModel.hasActivity) return null

  return (
    <Banner
      status="info"
      title={
        viewModel.latestVersionLabel
          ? t('update.newVersionAvailable', { version: viewModel.latestVersionLabel })
          : viewModel.headline
      }
      description={viewModel.statusLabel ?? (viewModel.canAutoInstall ? undefined : viewModel.headline)}
      endContent={
        viewModel.canAutoInstall ? (
          <Button
            label={viewModel.actionLabel}
            variant="primary"
            size="sm"
            isLoading={viewModel.isBusy}
            clickAction={runPrimaryAction}
          />
        ) : (
          <Button label={t('update.viewRelease')} size="sm" clickAction={viewRelease} />
        )
      }
    />
  )
}
