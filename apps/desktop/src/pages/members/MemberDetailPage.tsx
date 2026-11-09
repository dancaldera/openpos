import { Avatar } from '@astryxdesign/core/Avatar'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { Pencil } from 'lucide-react'
import { ConfirmAction } from '../../components/page/ConfirmAction'
import { Page } from '../../components/page/Page'
import { useTranslation } from '../../hooks/useTranslation'
import { formatDateTime } from '../../lib/format'
import { hrefFor, navigate } from '../../lib/router'
import { toast } from '../../lib/toast'
import { authService } from '../../services/auth-turso'
import { roleAccessLabel, roleLabel, useMemberAccess } from './memberAccess'
import { useMember } from './useMember'

interface MemberDetailPageProps {
  memberId: string
}

export default function MemberDetailPage({ memberId }: MemberDetailPageProps) {
  const { t } = useTranslation()
  const access = useMemberAccess()
  const { member, setMember, isLoading } = useMember(memberId)

  const breadcrumbs = [
    { label: t('members.title'), to: 'members' },
    { label: member?.name || t('members.memberHeader') },
  ]

  if (isLoading) {
    return (
      <Page title={t('members.memberHeader')} breadcrumbs={breadcrumbs} width={960}>
        <HStack hAlign="center" padding={10}>
          <Spinner label={t('common.loading')} />
        </HStack>
      </Page>
    )
  }

  if (!member) {
    return (
      <Page title={t('members.notFoundTitle')} breadcrumbs={breadcrumbs} width={960}>
        <EmptyState
          title={t('members.notFoundTitle')}
          description={t('members.notFoundDescription')}
          actions={<Button label={t('members.backToMembers')} href={hrefFor('members')} />}
        />
      </Page>
    )
  }

  const isArchived = Boolean(member.deletedAt)
  const isSelf = member.id === access.currentUserId
  const statusLabel = isArchived ? t('members.archived') : t('members.active')
  const canEdit = !isArchived && access.canEdit(member)
  const canArchive = !isArchived && access.canArchive(member)
  const canRestore = isArchived && access.canRestore

  const archive = async () => {
    const result = await authService.deleteUser(member.id)
    if (result.success) {
      toast.success(t('members.userArchived'))
      navigate('members')
    } else {
      toast.error(result.error || t('errors.generic'))
    }
  }

  const restore = async () => {
    const result = await authService.restoreUser(member.id)
    if (result.success && result.user) {
      setMember(result.user)
      toast.success(t('members.userRestored'))
    } else {
      toast.error(result.error || t('errors.generic'))
    }
  }

  return (
    <Page
      title={member.name}
      description={member.email}
      breadcrumbs={breadcrumbs}
      width={960}
      meta={
        <HStack gap={2} vAlign="center">
          <StatusDot variant={isArchived ? 'neutral' : 'success'} label={statusLabel} />
          <Text color="secondary">{statusLabel}</Text>
        </HStack>
      }
      actions={
        canEdit && (
          <Button label={t('common.edit')} icon={<Pencil size={16} />} href={hrefFor(`members/${member.id}/edit`)} />
        )
      }
    >
      <Card>
        <VStack gap={5}>
          <HStack gap={4} vAlign="center">
            <Avatar name={member.name} size="lg" tooltip={false} />
            <StackItem size="fill">
              <VStack gap={0.5}>
                <Text weight="semibold">{member.name}</Text>
                <Text type="supporting">
                  {isSelf
                    ? t('members.yourAccount')
                    : `${roleLabel(member.role, t)} · ${roleAccessLabel(member.role, t)}`}
                </Text>
              </VStack>
            </StackItem>
          </HStack>
          <MetadataList columns="multi" orientation="vertical" label={{ position: 'top' }}>
            <MetadataListItem label={t('members.email')}>{member.email}</MetadataListItem>
            <MetadataListItem label={t('members.role')}>
              {`${roleLabel(member.role, t)} · ${roleAccessLabel(member.role, t)}`}
            </MetadataListItem>
            <MetadataListItem label={t('members.pinSignIn')}>
              {member.pinEnabled ? t('members.pinEnabled') : t('members.pinNotSet')}
            </MetadataListItem>
            <MetadataListItem label={t('members.created')}>{formatDateTime(member.createdAt)}</MetadataListItem>
            <MetadataListItem label={t('members.lastLogin')}>
              {member.lastLogin ? (
                formatDateTime(member.lastLogin)
              ) : (
                <Text color="secondary">{t('members.neverLoggedIn')}</Text>
              )}
            </MetadataListItem>
            {member.deletedAt && (
              <MetadataListItem label={t('members.archived')}>{formatDateTime(member.deletedAt)}</MetadataListItem>
            )}
          </MetadataList>
        </VStack>
      </Card>

      {canRestore && (
        <VStack gap={3}>
          <Heading level={2}>{t('members.archiveSection')}</Heading>
          <Card>
            <VStack gap={3}>
              <Text type="supporting">{t('members.restoreUserMessage')}</Text>
              <HStack>
                <ConfirmAction
                  label={t('members.restore')}
                  title={t('members.restoreConfirmTitle')}
                  description={t('members.restoreUserMessage')}
                  confirmLabel={t('members.restore')}
                  cancelLabel={t('common.cancel')}
                  variant="secondary"
                  onConfirm={restore}
                />
              </HStack>
            </VStack>
          </Card>
        </VStack>
      )}

      {canArchive && (
        <VStack gap={3}>
          <Heading level={2}>{t('members.archiveSection')}</Heading>
          <Card>
            <VStack gap={3}>
              <Text type="supporting">{t('members.archiveUserMessage')}</Text>
              <HStack>
                <ConfirmAction
                  label={t('members.archiveMember')}
                  title={t('members.archiveConfirmTitle')}
                  description={t('members.archiveConfirmMessage')}
                  confirmLabel={t('members.archive')}
                  cancelLabel={t('common.cancel')}
                  onConfirm={archive}
                />
              </HStack>
            </VStack>
          </Card>
        </VStack>
      )}
    </Page>
  )
}
