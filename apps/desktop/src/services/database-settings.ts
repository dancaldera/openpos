import { requestApiJson } from '../lib/api-client'
import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'

export interface DatabaseSettings {
  configured: boolean
  hostedProvisioning: boolean
  databaseUrl: string | null
  org: string | null
  group: string | null
  updatedAt: string | null
}

interface DatabaseSettingsResponse {
  settings: DatabaseSettings
  connection?: {
    key: string
    storeName: string
    published: boolean
    dataPlane: { url: string; authToken?: string }
  }
}

export class DatabaseSettingsService {
  private static instance: DatabaseSettingsService

  static getInstance(): DatabaseSettingsService {
    if (!DatabaseSettingsService.instance) {
      DatabaseSettingsService.instance = new DatabaseSettingsService()
    }
    return DatabaseSettingsService.instance
  }

  async getSettings(): Promise<DatabaseSettings> {
    const data = await requestApiJson<DatabaseSettingsResponse>('/api/settings/database', {
      requireAuth: true,
    })
    return data.settings
  }

  async saveSettings(input: {
    databaseUrl?: string
    authToken?: string
    apiToken?: string
    org?: string
    group?: string
    publish?: boolean
  }): Promise<DatabaseSettings> {
    const data = await requestApiJson<DatabaseSettingsResponse>('/api/settings/database', {
      method: 'PUT',
      requireAuth: true,
      body: input,
    })
    if (isDesktop && data.connection?.dataPlane) {
      await requireDesktopApi().connection.applyRemote(data.connection)
    }
    return data.settings
  }

  async clearSettings(): Promise<void> {
    await requestApiJson('/api/settings/database', {
      method: 'DELETE',
      requireAuth: true,
    })
  }
}

export const databaseSettingsService = DatabaseSettingsService.getInstance()
