import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Lock } from 'lucide-react'
import { Page } from '../../components/page/Page'
import { useTranslation } from '../../hooks/useTranslation'
import MemberDetailPage from './MemberDetailPage'
import MemberFormPage from './MemberFormPage'
import MembersListPage from './MembersListPage'
import { useMemberAccess } from './memberAccess'

/** `members`, `members/new`, `members/<id>`, `members/<id>/edit`. */
export default function MembersSection({ params }: { params: string[] }) {
  const { t } = useTranslation()
  const access = useMemberAccess()
  const [first, second] = params

  if (!access.canView) {
    return (
      <Page title={t('members.title')}>
        <EmptyState
          icon={<Lock size={24} />}
          title={t('members.accessDenied')}
          description={t('members.noPermissionMembers')}
        />
      </Page>
    )
  }

  if (!first) return <MembersListPage />
  if (first === 'new') return <MemberFormPage key="new" />
  if (second === 'edit') return <MemberFormPage key={`edit-${first}`} memberId={first} />
  return <MemberDetailPage key={first} memberId={first} />
}
