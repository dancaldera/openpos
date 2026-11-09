import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { AccessScreen } from '../components/access/AccessScreen'
import { useTranslation } from '../hooks/useTranslation'
import { APP_VERSION } from '../lib/app-version'
import type { DesktopFirstRunStatus } from '../lib/desktop'

interface FirstRunSyncProps {
  status: DesktopFirstRunStatus
  isRetrying: boolean
  onRetry: () => Promise<void>
}

export default function FirstRunSync({ status, isRetrying, onRetry }: FirstRunSyncProps) {
  const { t } = useTranslation()

  const isSyncing = status.status === 'syncingInitialData'
  const isFailed = status.status === 'initialSyncFailed'

  return (
    <AccessScreen
      title={isSyncing ? t('startup.syncingTitle') : t('startup.initialSyncFailedTitle')}
      description={isSyncing ? t('startup.syncingDescription') : t('startup.initialSyncFailedDescription')}
      hasSyncStatus
      footer={[
        <Text key="version" type="supporting" hasTabularNumbers>
          {`v${APP_VERSION}`}
        </Text>,
        <Text key="required" type="supporting">
          {t('startup.firstRunRequired')}
        </Text>,
      ]}
    >
      <VStack gap={5}>
        {isSyncing && <ProgressBar label={t('startup.syncingTitle')} isLabelHidden isIndeterminate />}
        {isFailed && status.lastError ? (
          <Banner status="error" title={t('startup.lastErrorLabel')} description={status.lastError} />
        ) : null}

        <MetadataList>
          <MetadataListItem label={t('startup.remoteConfiguredLabel')}>
            {status.remoteConfigured ? t('common.yes') : t('common.no')}
          </MetadataListItem>
          {status.apiUrl ? (
            <MetadataListItem label={t('startup.apiUrlLabel')}>
              <Text wordBreak="break-all">{status.apiUrl}</Text>
            </MetadataListItem>
          ) : null}
          <MetadataListItem label={t('startup.activeUsersLabel')}>
            <Text hasTabularNumbers>{status.activeUserCount}</Text>
          </MetadataListItem>
        </MetadataList>

        {isFailed && (
          <Button
            label={t('startup.retry')}
            variant="primary"
            size="lg"
            width="100%"
            isLoading={isRetrying}
            onClick={() => void onRetry()}
          />
        )}
      </VStack>
    </AccessScreen>
  )
}
