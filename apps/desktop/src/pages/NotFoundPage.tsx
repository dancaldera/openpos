import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Page } from '../components/page/Page'
import { useTranslation } from '../hooks/useTranslation'
import { hrefFor } from '../lib/router'

export default function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <Page title={t('errors.pageNotFoundTitle')} width={720}>
      <EmptyState
        title={t('errors.pageNotFoundTitle')}
        description={t('errors.pageNotFoundDescription')}
        actions={<Button label={t('navigation.dashboard')} href={hrefFor('dashboard')} />}
      />
    </Page>
  )
}
