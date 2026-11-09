import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Lock } from 'lucide-react'
import { Page } from '../../components/page/Page'
import { useTranslation } from '../../hooks/useTranslation'
import CustomerDetailPage from './CustomerDetailPage'
import CustomerFormPage from './CustomerFormPage'
import CustomersListPage from './CustomersListPage'
import { useCustomerPermissions } from './customerMeta'

/** `customers`, `customers/new`, `customers/<id>`, `customers/<id>/edit`. */
export default function CustomersSection({ params }: { params: string[] }) {
  const { t } = useTranslation()
  const permissions = useCustomerPermissions()
  const [first, second] = params

  if (!permissions.canView) {
    return (
      <Page title={t('customers.title')}>
        <EmptyState
          icon={<Lock size={24} />}
          title={t('customers.accessDenied')}
          description={t('customers.noPermission')}
        />
      </Page>
    )
  }

  if (!first) return <CustomersListPage />
  if (first === 'new') return <CustomerFormPage key="new" />
  if (second === 'edit') return <CustomerFormPage key={`edit-${first}`} customerId={first} />
  return <CustomerDetailPage key={first} customerId={first} />
}
