import { Avatar } from '@astryxdesign/core/Avatar'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Link } from '@astryxdesign/core/Link'
import { Pagination } from '@astryxdesign/core/Pagination'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { pixel, proportional, Table, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Page } from '../../components/page/Page'
import { useTranslation } from '../../hooks/useTranslation'
import { formatDate, formatTime } from '../../lib/format'
import { hrefFor } from '../../lib/router'
import { toast } from '../../lib/toast'
import { authService, type User } from '../../services/auth-turso'
import { roleLabel, useMemberAccess } from './memberAccess'

const PAGE_SIZE = 10

type MemberView = 'active' | 'archived'

interface MemberRow extends Record<string, unknown> {
  id: string
  member: User
}

export default function MembersListPage() {
  const { t } = useTranslation()
  const genericError = t('errors.generic')
  const access = useMemberAccess()
  const [view, setView] = useState<MemberView>('active')
  const [members, setMembers] = useState<User[]>([])
  const [archived, setArchived] = useState<User[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [archivedPage, setArchivedPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCancelled = false
    setIsLoading(true)
    authService
      .getUsersPaginated(page, PAGE_SIZE)
      .then((result) => {
        if (isCancelled) return
        setMembers(result.users)
        setTotalCount(result.totalCount)
      })
      .catch((error: unknown) => {
        if (!isCancelled) toast.error(error instanceof Error ? error.message : genericError)
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false)
      })
    return () => {
      isCancelled = true
    }
  }, [page, genericError])

  useEffect(() => {
    if (!access.canViewArchived) return
    let isCancelled = false
    authService
      .getDeletedUsers()
      .then((result) => {
        if (!isCancelled) setArchived(result)
      })
      .catch((error: unknown) => {
        if (!isCancelled) toast.error(error instanceof Error ? error.message : genericError)
      })
    return () => {
      isCancelled = true
    }
  }, [access.canViewArchived, genericError])

  const isArchivedView = view === 'archived' && access.canViewArchived
  const rows: MemberRow[] = isArchivedView
    ? archived
        .slice((archivedPage - 1) * PAGE_SIZE, archivedPage * PAGE_SIZE)
        .map((member) => ({ id: member.id, member }))
    : members.map((member) => ({ id: member.id, member }))
  const total = isArchivedView ? archived.length : totalCount
  const currentPage = isArchivedView ? archivedPage : page
  const setCurrentPage = isArchivedView ? setArchivedPage : setPage

  const dateCell = (value: string) => (
    <VStack gap={0.5}>
      <Text>{formatDate(value)}</Text>
      <Text type="supporting">{formatTime(value)}</Text>
    </VStack>
  )

  const columns: TableColumn<MemberRow>[] = [
    {
      key: 'member',
      header: t('members.memberHeader'),
      width: proportional(2, { minWidth: 240 }),
      renderCell: ({ member }) => (
        <HStack gap={3} vAlign="center">
          <Avatar name={member.name} size="md" tooltip={false} />
          <VStack gap={0.5}>
            <HStack gap={2} vAlign="center">
              <Link href={hrefFor(`members/${member.id}`)}>
                <Text type="inherit" weight="medium" maxLines={1}>
                  {member.name}
                </Text>
              </Link>
              {member.pinEnabled && !isArchivedView && <Token label={t('members.pinBadge')} size="sm" />}
              {member.id === access.currentUserId && <Token label={t('members.you')} size="sm" color="blue" />}
            </HStack>
            <Text type="supporting" maxLines={1}>
              {member.email}
            </Text>
          </VStack>
        </HStack>
      ),
    },
    {
      key: 'role',
      header: t('members.role'),
      width: pixel(140),
      renderCell: ({ member }) => <Text>{roleLabel(member.role, t)}</Text>,
    },
    {
      key: 'date',
      header: isArchivedView ? t('members.archived') : t('members.created'),
      width: pixel(150),
      renderCell: ({ member }) => dateCell(isArchivedView ? (member.deletedAt ?? member.createdAt) : member.createdAt),
    },
    {
      key: 'lastLogin',
      header: t('members.lastLogin'),
      width: pixel(150),
      renderCell: ({ member }) =>
        member.lastLogin ? dateCell(member.lastLogin) : <Text color="secondary">{t('members.neverLoggedIn')}</Text>,
    },
  ]

  return (
    <Page
      title={t('members.title')}
      description={t('members.subtitle')}
      actions={
        access.canCreate && (
          <Button
            label={t('members.newMember')}
            variant="primary"
            icon={<Plus size={16} />}
            href={hrefFor('members/new')}
          />
        )
      }
    >
      <Card padding={0}>
        <VStack>
          {access.canViewArchived && (
            <HStack padding={4}>
              <SegmentedControl
                label={t('members.viewLabel')}
                value={view}
                onChange={(value) => setView(value as MemberView)}
              >
                <SegmentedControlItem value="active" label={t('members.activeTab', { count: totalCount })} />
                <SegmentedControlItem value="archived" label={t('members.archivedTab', { count: archived.length })} />
              </SegmentedControl>
            </HStack>
          )}

          {isLoading && !isArchivedView && members.length === 0 ? (
            <HStack hAlign="center" padding={10}>
              <Spinner label={t('members.loadingMembers')} />
            </HStack>
          ) : rows.length === 0 ? (
            <VStack padding={6}>
              <EmptyState
                title={isArchivedView ? t('members.noArchivedUsers') : t('members.noMembers')}
                description={isArchivedView ? t('members.noArchivedUsersDesc') : t('members.emptyTeam')}
                actions={
                  !isArchivedView &&
                  access.canCreate && (
                    <Button label={t('members.newMember')} variant="primary" href={hrefFor('members/new')} />
                  )
                }
              />
            </VStack>
          ) : (
            <Table<MemberRow> data={rows} columns={columns} idKey="id" density="balanced" hasHover />
          )}

          {total > 0 && (
            <HStack hAlign="between" vAlign="center" padding={4} wrap="wrap" gap={3}>
              <Text type="supporting">
                {t('members.membersTotal', {
                  count: total,
                  unit: total === 1 ? t('members.member') : t('members.members'),
                })}
              </Text>
              {total > PAGE_SIZE && (
                <Pagination page={currentPage} onChange={setCurrentPage} totalItems={total} pageSize={PAGE_SIZE} />
              )}
            </HStack>
          )}
        </VStack>
      </Card>
    </Page>
  )
}
