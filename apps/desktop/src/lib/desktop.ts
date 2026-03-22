export interface DesktopDbConnectionConfig {
  url?: string
  authToken?: string
  configured: boolean
}

export interface RuntimeConfig {
  tursoDatabaseUrl?: string
  tursoAuthToken?: string
  printerCommand?: string
  printerArgs?: string[]
}

export interface DesktopDatabaseStatement {
  sql: string
  params?: unknown[]
}

export interface DesktopApi {
  getInfo(): Promise<{ isDesktop: boolean; isElectron: boolean; version: string }>
  greet(name: string): Promise<string>
  hashPassword(password: string): Promise<string>
  verifyPassword(password: string, hash: string): Promise<boolean>
  getDbConnectionConfig(): Promise<DesktopDbConnectionConfig>
  getRuntimeConfig(): Promise<RuntimeConfig>
  printThermalReceipt(receiptData: string): Promise<string>
  db: {
    query<T>(sql: string, params?: unknown[]): Promise<T[]>
    execute(sql: string, params?: unknown[]): Promise<{ lastInsertId: number; rowsAffected: number }>
    transaction(statements: DesktopDatabaseStatement[]): Promise<void>
  }
}

declare global {
  interface Window {
    __OPENPOS_DESKTOP__?: { isElectron?: boolean }
    openposDesktop?: DesktopApi
  }
}

export function getDesktopApi(): DesktopApi | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.openposDesktop ?? null
}

export function requireDesktopApi(): DesktopApi {
  const api = getDesktopApi()
  if (!api) {
    throw new Error('Desktop API is not available in this runtime')
  }
  return api
}
