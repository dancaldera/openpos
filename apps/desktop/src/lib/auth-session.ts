const DEFAULT_AUTH_EXPIRED_MESSAGE = 'Authentication expired. Please sign in again.'

type SessionExpiredHandler = (message: string) => void

let sessionExpiredHandler: SessionExpiredHandler | null = null

export class AuthExpiredError extends Error {
  constructor(message: string = DEFAULT_AUTH_EXPIRED_MESSAGE) {
    super(message)
    this.name = 'AuthExpiredError'
  }
}

export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  sessionExpiredHandler = handler
}

export function clearPersistedAuth(): void {
  localStorage.removeItem('pos_user')
  localStorage.removeItem('auth_token')
}

export function expireSession(message: string = DEFAULT_AUTH_EXPIRED_MESSAGE): never {
  clearPersistedAuth()
  sessionExpiredHandler?.(message)
  throw new AuthExpiredError(message)
}

export function isAuthExpiredError(error: unknown): error is AuthExpiredError {
  return error instanceof AuthExpiredError
}

export function isExpiredTokenMessage(message: string | null | undefined): boolean {
  if (!message) {
    return false
  }

  const normalized = message.toLowerCase()
  return (
    normalized.includes('expired token') ||
    normalized.includes('token expired') ||
    normalized.includes('invalid or expired token')
  )
}
