import { Avatar } from '@astryxdesign/core/Avatar'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { List, ListItem } from '@astryxdesign/core/List'
import { VStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import type { User } from '../../services/auth-turso'

interface MemberPickerProps {
  users: User[]
  onSelect: (user: User) => void
  isDisabled?: boolean
}

/** Searchable list of members who can sign in with a PIN. */
export function MemberPicker({ users, onSelect, isDisabled = false }: MemberPickerProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const filtered = q
    ? users.filter((member) => member.name.toLowerCase().includes(q) || member.role.toLowerCase().includes(q))
    : users

  if (users.length === 0) {
    return <EmptyState title={t('auth.noAccountsAvailable')} />
  }

  return (
    <VStack gap={3}>
      <TextInput
        label={t('auth.searchMembers')}
        isLabelHidden
        type="search"
        value={query}
        onChange={(value) => setQuery(value)}
        placeholder={t('auth.searchMembers')}
        startIcon={Search}
        hasClear
        hasAutoFocus
        autoComplete="off"
      />
      {filtered.length === 0 ? (
        <EmptyState title={t('auth.noMembersFound')} />
      ) : (
        <div className="max-h-72 overflow-y-auto">
          <List hasDividers edge="flush">
            {filtered.map((member) => (
              <ListItem
                key={member.id}
                label={member.name}
                description={t(`members.${member.role}`)}
                startContent={<Avatar name={member.name} size="md" tooltip={false} />}
                isDisabled={isDisabled}
                onClick={() => {
                  setQuery('')
                  onSelect(member)
                }}
              />
            ))}
          </List>
        </div>
      )}
    </VStack>
  )
}
