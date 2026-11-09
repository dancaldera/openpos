import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack } from '@astryxdesign/core/Stack'
import { Page, type PageCrumb } from '../../components/page/Page'
import { useTranslation } from '../../hooks/useTranslation'
import { hrefFor } from '../../lib/router'

interface StateProps {
  title: string
  breadcrumbs?: PageCrumb[]
  width?: number
}

export function ProductLoadingPage({ title, breadcrumbs, width = 960 }: StateProps) {
  const { t } = useTranslation()
  return (
    <Page title={title} breadcrumbs={breadcrumbs} width={width}>
      <HStack hAlign="center" padding={10}>
        <Spinner label={t('common.loading')} />
      </HStack>
    </Page>
  )
}

export function ProductNotFoundPage() {
  const { t } = useTranslation()
  return (
    <Page
      title={t('products.notFoundTitle')}
      breadcrumbs={[{ label: t('products.title'), to: 'products' }, { label: t('products.notFoundTitle') }]}
      width={960}
    >
      <EmptyState
        title={t('products.notFoundTitle')}
        description={t('products.notFoundDescription')}
        actions={<Button label={t('products.backToProducts')} href={hrefFor('products')} />}
      />
    </Page>
  )
}

export function ProductAccessDeniedPage({ canView }: { canView: boolean }) {
  const { t } = useTranslation()
  return (
    <Page title={t('products.title')} width={960}>
      <EmptyState
        title={t('products.accessDenied')}
        description={t('products.noPermission')}
        actions={canView ? <Button label={t('products.backToProducts')} href={hrefFor('products')} /> : undefined}
      />
    </Page>
  )
}
