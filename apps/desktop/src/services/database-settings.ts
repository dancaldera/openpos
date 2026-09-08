import { requestApiJson } from '../lib/api-client'
import { execute, query } from '../lib/db-adapter'
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

interface DatabaseSettingsRow {
  database_url?: string | null
  auth_token_encrypted?: string | null
  api_token_encrypted?: string | null
  org?: string | null
  group_name?: string | null
  updated_at?: string | null
}

function toDatabaseSettings(row?: DatabaseSettingsRow | null): DatabaseSettings {
  return {
    configured: Boolean(row?.database_url && row?.auth_token_encrypted),
    hostedProvisioning: Boolean(row?.api_token_encrypted && row?.org && row?.group_name),
    databaseUrl: row?.database_url ?? null,
    org: row?.org ?? null,
    group: row?.group_name ?? null,
    updatedAt: row?.updated_at ?? null,
  }
}

export class DatabaseSettingsService {
  async getSettings(): Promise<DatabaseSettings> {
    if (isDesktop) {
      const rows = await query<DatabaseSettingsRow>(
        `SELECT database_url, auth_token_encrypted, api_token_encrypted, org, group_name, updated_at
         FROM database_settings WHERE id = 1 LIMIT 1`,
      )
      return toDatabaseSettings(rows[0])
    }

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
    if (isDesktop) {
      return this.saveDesktopSettings(input)
    }

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
    if (isDesktop) {
      await execute('DELETE FROM database_settings WHERE id = 1')
      return
    }

    await requestApiJson('/api/settings/database', {
      method: 'DELETE',
      requireAuth: true,
    })
  }

  private async saveDesktopSettings(input: {
    databaseUrl?: string
    authToken?: string
    apiToken?: string
    org?: string
    group?: string
    publish?: boolean
  }): Promise<DatabaseSettings> {
    const existing = (
      await query<DatabaseSettingsRow>(
        `SELECT database_url, auth_token_encrypted, api_token_encrypted, org, group_name, updated_at
         FROM database_settings WHERE id = 1 LIMIT 1`,
      )
    )[0]
    const desktop = requireDesktopApi()
    const databaseUrl =
      input.databaseUrl === undefined ? existing?.database_url?.trim() || '' : input.databaseUrl.trim()
    const org = input.org === undefined ? existing?.org?.trim() || '' : input.org.trim()
    const group = input.group === undefined ? existing?.group_name?.trim() || '' : input.group.trim()
    const authToken = input.authToken?.trim() || ''
    const apiToken = input.apiToken?.trim() || ''
    const encryptedAuthToken = authToken
      ? await desktop.encryptSecret(authToken)
      : existing?.auth_token_encrypted || null
    const encryptedApiToken = apiToken ? await desktop.encryptSecret(apiToken) : existing?.api_token_encrypted || null
    const now = new Date().toISOString()

    if (org || group || apiToken || encryptedApiToken) {
      if (!org || !group || !encryptedApiToken) {
        throw new Error('Turso API token, org, and group are all required')
      }
    }

    if (existing) {
      await execute(
        `UPDATE database_settings
         SET database_url = ?, auth_token_encrypted = ?, api_token_encrypted = ?, org = ?, group_name = ?, updated_at = ?
         WHERE id = 1`,
        [databaseUrl || null, encryptedAuthToken, encryptedApiToken, org || null, group || null, now],
      )
    } else {
      await execute(
        `INSERT INTO database_settings
         (id, database_url, auth_token_encrypted, api_token_encrypted, org, group_name, created_at, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
        [databaseUrl || null, encryptedAuthToken, encryptedApiToken, org || null, group || null, now, now],
      )
    }

    const resolvedAuthToken =
      authToken || (existing?.auth_token_encrypted ? await desktop.decryptSecret(existing.auth_token_encrypted) : '')
    if (databaseUrl && resolvedAuthToken) {
      const active = await desktop.connection.getActive()
      await desktop.connection.applyRemote({
        key: active?.key,
        published: true,
        dataPlane: { url: databaseUrl, authToken: resolvedAuthToken },
      })
    } else if (input.publish && !databaseUrl) {
      throw new Error('Save a Turso database URL and token, or import the database from the first-run screen.')
    }

    const rows = await query<DatabaseSettingsRow>(
      `SELECT database_url, auth_token_encrypted, api_token_encrypted, org, group_name, updated_at
       FROM database_settings WHERE id = 1 LIMIT 1`,
    )
    return toDatabaseSettings(rows[0])
  }
}

export const databaseSettingsService = new DatabaseSettingsService()
