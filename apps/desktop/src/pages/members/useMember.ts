import { useEffect, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { toast } from '../../lib/toast'
import { authService, type User } from '../../services/auth-turso'

/** Loads one member (active or archived) by id. */
export function useMember(memberId: string) {
  const { t } = useTranslation()
  const genericError = t('errors.generic')
  const [member, setMember] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCancelled = false
    setIsLoading(true)
    authService
      .getUsers()
      .then((users) => {
        if (!isCancelled) setMember(users.find((entry) => entry.id === memberId) ?? null)
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
  }, [memberId, genericError])

  return { member, setMember, isLoading }
}
