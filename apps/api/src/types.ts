import type { StoreRecord } from '@openpos/control-plane'

export interface JwtPayload {
  sub: string // user id
  email: string
  name: string
  role: 'admin' | 'manager' | 'user'
  permissions: string[]
  /** Store the session belongs to; authoritative for every protected request. */
  storeId?: string
  /** Tokens issued before store ids existed carry the connection key instead. */
  connectionKey?: string
  iat?: number
  exp?: number
}

export interface AppEnv {
  Variables: {
    jwtPayload: JwtPayload
    store: StoreRecord
  }
}
